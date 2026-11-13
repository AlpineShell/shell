use crate::touchpad_layout::{ContactReading, ReportReading};

#[derive(Default)]
pub struct FrameAssembler {
    expected: usize,
    collected: Vec<ContactReading>,
}

impl FrameAssembler {
    pub fn push_report(&mut self, report: ReportReading) -> Option<&[ContactReading]> {
        if report.contact_count > 0 {
            self.expected = report.contact_count as usize;
            self.collected.clear();
        }
        if self.expected == 0 {
            return None;
        }
        let missing = self.expected - self.collected.len();
        self.collected.extend(report.contacts.into_iter().take(missing));
        if self.collected.len() < self.expected {
            return None;
        }
        self.expected = 0;
        self.collected.retain(|contact| contact.touching);
        Some(&self.collected)
    }
}

pub struct SwipeGate {
    swipe_finger_count: usize,
    idle: bool,
}

impl SwipeGate {
    pub fn new(swipe_finger_count: u32) -> Self {
        SwipeGate {
            swipe_finger_count: swipe_finger_count as usize,
            idle: true,
        }
    }

    pub fn forwards(&mut self, touching_count: usize) -> bool {
        if self.idle {
            self.idle = touching_count != self.swipe_finger_count;
            return !self.idle;
        }
        self.idle = touching_count == 0;
        true
    }
}

pub struct SwipeFrames {
    assembler: FrameAssembler,
    gate: SwipeGate,
}

impl SwipeFrames {
    pub fn new(swipe_finger_count: u32) -> Self {
        SwipeFrames {
            assembler: FrameAssembler::default(),
            gate: SwipeGate::new(swipe_finger_count),
        }
    }

    pub fn push_report(&mut self, report: ReportReading) -> Option<&[ContactReading]> {
        let frame = self.assembler.push_report(report)?;
        self.gate.forwards(frame.len()).then_some(frame)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contact(id: u32, touching: bool, x: f64) -> ContactReading {
        ContactReading { id, touching, x, y: 0.5 }
    }

    fn fingers(count: u32, x: f64) -> Vec<ContactReading> {
        (0..count).map(|index| contact(index, true, x + f64::from(index) * 0.01)).collect()
    }

    fn report(contact_count: u32, contacts: Vec<ContactReading>) -> ReportReading {
        ReportReading { contact_count, contacts }
    }

    fn ids(frame: &[ContactReading]) -> Vec<u32> {
        frame.iter().map(|contact| contact.id).collect()
    }

    fn report_with_one_lifted_contact(touching_count: u32) -> ReportReading {
        let mut contacts = fingers(touching_count, 0.3);
        contacts.push(contact(touching_count, false, 0.3));
        report(touching_count + 1, contacts)
    }

    fn forwarded_frame_sizes(swipe_finger_count: u32, touching_counts: &[u32]) -> Vec<usize> {
        let mut frames = SwipeFrames::new(swipe_finger_count);
        touching_counts
            .iter()
            .filter_map(|&count| frames.push_report(report_with_one_lifted_contact(count)).map(<[ContactReading]>::len))
            .collect()
    }

    #[test]
    fn returns_the_touching_contacts_of_a_frame_sent_in_one_report() {
        let mut assembler = FrameAssembler::default();
        let frame = assembler
            .push_report(report(2, vec![contact(1, true, 0.1), contact(2, false, 0.3), contact(0, false, 0.0)]))
            .map(ids);
        assert_eq!(frame, Some(vec![1]));
    }

    #[test]
    fn joins_a_frame_the_touchpad_splits_across_reports() {
        let mut assembler = FrameAssembler::default();
        assert!(assembler.push_report(report(3, fingers(2, 0.1))).is_none());
        let mut continuation = vec![contact(7, true, 0.5)];
        continuation.extend(fingers(1, 0.9));
        let second = assembler.push_report(report(0, continuation)).map(ids);
        assert_eq!(second, Some(vec![0, 1, 7]));
    }

    #[test]
    fn ignores_a_continuation_report_with_no_frame_in_progress() {
        let mut assembler = FrameAssembler::default();
        assert!(assembler.push_report(report(0, fingers(2, 0.1))).is_none());
    }

    #[test]
    fn ignores_a_continuation_report_after_a_completed_frame() {
        let mut assembler = FrameAssembler::default();
        assert!(assembler.push_report(report(1, fingers(1, 0.1))).is_some());
        assert!(assembler.push_report(report(0, fingers(1, 0.1))).is_none());
    }

    #[test]
    fn restarts_a_frame_when_a_new_one_begins_before_the_last_completed() {
        let mut assembler = FrameAssembler::default();
        assert!(assembler.push_report(report(3, fingers(1, 0.1))).is_none());
        assert_eq!(assembler.push_report(report(2, fingers(2, 0.4))).map(ids), Some(vec![0, 1]));
    }

    #[test]
    fn drops_frames_that_cannot_start_a_swipe_while_idle() {
        assert_eq!(forwarded_frame_sizes(3, &[1, 2, 4, 1, 0]), Vec::<usize>::new());
    }

    #[test]
    fn forwards_every_frame_from_a_swipe_start_until_the_fingers_lift() {
        assert_eq!(forwarded_frame_sizes(3, &[1, 3, 3, 2, 4, 1, 0, 2, 1]), vec![3, 3, 2, 4, 1, 0]);
    }

    #[test]
    fn forwards_the_next_swipe_after_the_fingers_lift() {
        assert_eq!(forwarded_frame_sizes(3, &[3, 0, 2, 3, 3, 0]), vec![3, 0, 3, 3, 0]);
    }

    #[test]
    fn counts_only_touching_contacts_against_the_swipe_finger_count() {
        let mut frames = SwipeFrames::new(3);
        let mut hovering = fingers(3, 0.3);
        hovering.push(contact(9, false, 0.8));
        assert!(frames.push_report(report(4, hovering)).is_some());
        let mut lifting = fingers(2, 0.3);
        lifting.push(contact(2, false, 0.3));
        assert_eq!(frames.push_report(report(3, lifting)).map(<[ContactReading]>::len), Some(2));
    }

    #[test]
    fn uses_the_swipe_finger_count_it_was_given() {
        assert_eq!(forwarded_frame_sizes(4, &[3, 4, 2, 0]), vec![4, 2, 0]);
    }
}
