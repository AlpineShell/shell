import { CircleDashed, LogOut, Power, RotateCcw } from "lucide-react";
import PopupMenu from "./shared/popupMenu";
import { useDarkText } from "../themeContext";

function MenuItem({ label, Icon, onClick, darkText }: { label: string; Icon: React.FC<{ color: string; size: number }>; onClick: () => void; darkText: boolean }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2.5 w-full px-2 py-1 rounded-md text-[12px] ${darkText ? "text-black/80 hover:bg-black/10 hover:text-black" : "text-white/80 hover:bg-white/10 hover:text-white"} transition-colors cursor-pointer`}
        >
            <Icon color="currentColor" size={12} />
            {label}
        </button>
    );
}

export default function SystemMenu() {
    const darkText = useDarkText();

    return (
        <PopupMenu
            trigger={
                <div className="flex px-2 h-5 items-center cursor-pointer">
                    <CircleDashed color={darkText ? "black" : "white"} size={14} />
                </div>
            }
        >
            <div className="p-1.5 flex flex-col w-35 shadow-2xl">
                <MenuItem label="Log Out" Icon={LogOut} onClick={() => window.shell.system.powerAction('logout')} darkText={darkText} />
                <MenuItem label="Restart" Icon={RotateCcw} onClick={() => window.shell.system.powerAction('restart')} darkText={darkText} />
                <MenuItem label="Shut Down" Icon={Power} onClick={() => window.shell.system.powerAction('shutdown')} darkText={darkText} />
            </div>
        </PopupMenu>
    );
}
