import { CircleDashed } from "lucide-react";

export default function SystemMenuFace({ darkText }: SystemMenuFaceProps) {
    return (
        <div className="flex px-2 h-5 items-center cursor-pointer">
            <CircleDashed color={darkText ? "black" : "white"} size={14} />
        </div>
    );
}
