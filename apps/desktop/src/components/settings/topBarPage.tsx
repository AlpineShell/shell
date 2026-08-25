import PageTitle from '../ui/pageTitle'
import TopBarAppearanceSection from './topBarAppearanceSection'
import TopBarTraySection from './topBarTraySection'
import TopBarClockSection from './topBarClockSection'

export default function TopBarPage() {
  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle title="Top Bar" />
      <TopBarAppearanceSection />
      <TopBarTraySection />
      <TopBarClockSection />
    </div>
  )
}
