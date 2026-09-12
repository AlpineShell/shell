export default function ClockFace({ time, date, darkText }: ClockFaceProps) {
    return (
        <div className={`${darkText ? "text-black" : "text-white"} text-[12px] flex hover:cursor-pointer rounded-full px-2 ${darkText ? "hover:bg-black/10" : "hover:bg-white/10"} h-4.5 items-center transition-colors duration-300`}>
            {time} {date}
        </div>
    );
}
