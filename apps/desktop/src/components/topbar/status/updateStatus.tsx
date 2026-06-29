import { CheckCircle2, Download } from "lucide-react";
import { useUpdate } from "../../../hooks/useUpdate";
import { useDarkText } from "../../themeContext";

export default function UpdateStatus() {
    const darkText = useDarkText();
    const { state, install } = useUpdate();

    const ready = state.status === "downloaded";
    const available = state.status === "available";

    if (!ready && !available) return null;

    const label = ready ? "Update ready" : "Update available";
    const Icon = ready ? CheckCircle2 : Download;

    const handleClick = () => {
        if (ready) {
            install();
        } else {
            window.shell.windows.openSettings("updates");
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            title={label}
            aria-label={label}
            className={`flex items-center h-4.5 gap-1.5 px-2 rounded-full text-[12px] leading-none cursor-pointer transition-colors duration-300 ${darkText ? "bg-black/10 hover:bg-black/15 text-black" : "bg-white/15 hover:bg-white/20 text-white"}`}
        >
            <Icon size={13} className="shrink-0" />
            <span className="truncate">{label}</span>
        </button>
    );
}
