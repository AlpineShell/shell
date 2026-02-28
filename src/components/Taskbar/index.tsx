import AppBar from './AppBar'
import Clock from './Clock'
import QuickSettings from './QuickSettings'

export default function Taskbar() {
    return (
        <div className="flex justify-between m-3">
            <div>
                <AppBar />
            </div>
            <div className='flex gap-3'>
                <QuickSettings />
                <Clock />
            </div>
        </div>
    )
}
