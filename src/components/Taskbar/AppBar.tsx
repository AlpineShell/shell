import { Circle } from "lucide-react";

export default function AppBar() {
    return (
        <div className="bg-systemBg gap-1 px-1 items-center flex h-full rounded-full">
            <div className="bg-systemBg p-2 w-fit h-fit rounded-full">
                <Circle size={20} />
            </div>
            <div className="bg-systemBg text-mist-700 pl-3 w-50 p-1.5 h-fit rounded-full">
                Search...
            </div>
            <div className="ml-3">
                
            </div>
        </div>
    );
}