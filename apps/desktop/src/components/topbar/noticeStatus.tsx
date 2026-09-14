import { useDarkText } from "../themeContext";
import { useShellNotice } from "../../hooks/useShellNotice";
import NoticeFace from "./faces/noticeFace";

export default function NoticeStatus() {
    const darkText = useDarkText();
    const notice = useShellNotice();

    if (!notice || !notice.pill) return null;

    return <NoticeFace notice={notice} darkText={darkText} />;
}
