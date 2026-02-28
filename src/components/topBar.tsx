import Clock from "./clock";

export default function TopBar() {
    return (
        <div className="w-full flex justify-between items-center h-6 bg-[#3F3F3F]/20">
            <div></div>
            <Clock />
        </div>
    );
}