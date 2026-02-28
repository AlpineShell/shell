import Clock from './Clock'
import QuickSettings from './QuickSettings'

export default function Taskbar() {
    return (
        <div className="flex justify-between m-3">
            <div></div>
            <div className='flex gap-3'>
                <QuickSettings />
                <Clock />
            </div>
        </div>
    )
}
