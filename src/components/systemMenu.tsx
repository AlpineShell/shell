import { CircleDashed, House, LogOut, Power, RotateCcw } from "lucide-react";
import PopupMenu from "./popupMenu";

function MenuItem({ label, Icon, onClick }: { label: string; Icon: React.FC<{ color: string; size: number }>; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2.5 w-full px-3 py-1 rounded-md text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
            <Icon color="currentColor" size={15} />
            {label}
        </button>
    );
}

export default function SystemMenu() {
    return (
        <PopupMenu
            align="left"
            trigger={
                <div className="flex px-2 py-0.5 items-center cursor-pointer">
                    <CircleDashed color="white" size={14} />
                </div>
            }
        >
            <div className="p-1.5 flex flex-col w-48 shadow-2xl">
                <MenuItem label="Log Out" Icon={LogOut} onClick={() => window.shell.system.powerAction('logout')} />
                <MenuItem label="Restart" Icon={RotateCcw} onClick={() => window.shell.system.powerAction('restart')} />
                <MenuItem label="Shut Down" Icon={Power} onClick={() => window.shell.system.powerAction('shutdown')} />
            </div>
        </PopupMenu>
    );
}
