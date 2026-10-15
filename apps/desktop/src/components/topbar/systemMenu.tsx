import { useState } from "react";
import { LogOut, Power, RotateCcw, Snowflake } from "lucide-react";
import PopupMenu from "./shared/popupMenu";
import SystemMenuFace from "./faces/systemMenuFace";
import { powerMenuPress } from "./powerMenuPress";
import { useDarkText } from "../themeContext";
import { usePowerConfirm } from "../../hooks/usePowerConfirm";
import { useShowHibernate } from "../../hooks/useShowHibernate";

const POWER_MENU_ENTRIES = [
    { action: "logout", label: "Log Out", Icon: LogOut, confirm: true },
    { action: "hibernate", label: "Hibernate", Icon: Snowflake, confirm: false },
    { action: "restart", label: "Restart", Icon: RotateCcw, confirm: true },
    { action: "shutdown", label: "Shut Down", Icon: Power, confirm: true },
] as const;

function confirmationLabel(label: string) {
    return `Confirm ${label.toLowerCase()}?`;
}

export function SystemMenuActions({ darkText, confirmRequired, showHibernate }: SystemMenuActionsProps) {
    const [armed, setArmed] = useState<PowerAction | null>(null);

    function press(action: PowerAction, confirm: boolean) {
        const outcome = powerMenuPress(armed, action, confirmRequired && confirm);
        if ("run" in outcome) window.shell.system.powerAction(outcome.run);
        else setArmed(outcome.armed);
    }

    return (
        <div className="p-1.5 flex flex-col min-w-35 shadow-2xl">
            {POWER_MENU_ENTRIES.filter(({ action }) => action !== "hibernate" || showHibernate).map(({ action, label, Icon, confirm }) => {
                const shownLabel = armed === action ? confirmationLabel(label) : label;
                const widestLabel = confirmRequired && confirm ? confirmationLabel(label) : label;
                return (
                    <button
                        key={action}
                        onClick={() => press(action, confirm)}
                        className={`flex items-center gap-2.5 w-full px-2 py-1 rounded-md text-[12px] ${darkText ? "text-black/80 hover:bg-black/10 hover:text-black" : "text-white/80 hover:bg-white/10 hover:text-white"} transition-colors cursor-pointer`}
                    >
                        <Icon color="currentColor" size={12} />
                        <span className="grid text-left">
                            <span className="col-start-1 row-start-1">{shownLabel}</span>
                            <span aria-hidden="true" className="col-start-1 row-start-1 invisible">{widestLabel}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export default function SystemMenu() {
    const darkText = useDarkText();
    const confirmRequired = usePowerConfirm();
    const showHibernate = useShowHibernate();

    return (
        <PopupMenu trigger={<SystemMenuFace darkText={darkText} />}>
            <SystemMenuActions darkText={darkText} confirmRequired={confirmRequired} showHibernate={showHibernate} />
        </PopupMenu>
    );
}
