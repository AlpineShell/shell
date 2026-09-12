import { Search } from "lucide-react";

export default function LauncherFace({ darkText }: LauncherFaceProps) {
    return (
        <span
            className={`flex items-center gap-1.5 px-2 h-5 rounded-full cursor-pointer transition-colors ${
                darkText ? "hover:bg-black/10" : "hover:bg-white/10"
            }`}
        >
            <Search color={darkText ? "black" : "white"} size={12} />
            <span className={`text-[11px] ${darkText ? "text-black/70" : "text-white/70"}`}>Search</span>
        </span>
    );
}
