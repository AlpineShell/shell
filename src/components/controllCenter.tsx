import { Bluetooth, ChevronRight, Wifi } from "lucide-react";

export default function ControlCenter() {
    return (
        <div className="bg-[#1f262d] p-4 gap-5 flex flex-col border-[0.5px] border-[#2c343b] rounded-xl h-90 w-65 shadow-2xl">
            {ControlItem("The Wifi", Wifi)}
            {ControlItem("The Bluetooth", Bluetooth)}
        </div>
    )
}

function ControlItem(name: string, Icon: React.FC<{ color: string; size: number }>) {
    return (
        <div className="flex cursor-pointer justify-between items-center text-white">
            <div className="flex gap-2 text-sm items-center">
                <Icon color="white" size={15} />
                {name}
            </div>
            <ChevronRight color="white" size={15} />
        </div>
    )
}