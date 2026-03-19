import { AudioLines } from "lucide-react";

export default function Status() {
    return (
        <div className="flex items-center gap-2 bg-green-500/20 px-2 max-w-50 rounded-full text-[12px] text-white">
            <AudioLines size={10} className="shrink-0" />
            <span className="truncate">
                Never gonna give you up - Rick Astley
            </span>
        </div>
    );
}