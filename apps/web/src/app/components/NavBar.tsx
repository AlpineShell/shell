"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type NavBarProps = {
    theme?: "dark" | "light";
};

export default function NavBar({ theme = "dark" }: NavBarProps) {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 16);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const onLight = theme === "light" && scrolled;

    return (
        <header
            className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
                scrolled
                    ? theme === "light"
                        ? "border-black/10 bg-white"
                        : "border-white/10 bg-[#0a0a0a]"
                    : "border-transparent"
            }`}
        >
            <div className="px-8">
                <nav
                    className={`container mx-auto flex items-center justify-between py-4 transition-colors duration-300 ${
                        onLight ? "text-gray-900" : "text-white"
                    }`}
                >
                    <Link href="/">
                        <Image
                            src="/Logo.svg"
                            alt="Alpine Shell Logo"
                            width={170}
                            height={50}
                            className={`h-7.5 w-auto transition-all duration-300 ${onLight ? "brightness-0" : ""}`}
                        />
                    </Link>
                    <div>
                        <Link href="/" className="px-4 rounded">Home</Link>
                        <Link href="/plugins" className="px-4 rounded">Plugins</Link>
                        <Link href="/docs" className="px-4 rounded">Docs</Link>
                    </div>
                    <button
                        className={`rounded-full border px-4 py-2 font-averia transition-colors duration-300 ${
                            onLight ? "border-gray-900" : "border-white"
                        }`}
                    >
                        <p>Get your PC back</p>
                    </button>
                </nav>
            </div>
        </header>
    );
}
