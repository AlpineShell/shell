import Image from "next/image";
import Link from "next/link";

type FooterProps = {
    theme?: "light" | "dark";
};

const themes = {
    light: {
        footer: "bg-white text-gray-900",
        muted: "text-gray-600",
        subtle: "text-gray-500",
        border: "border-black/10",
        link: "transition hover:text-black",
        logo: "brightness-0",
    },
    dark: {
        footer: "text-gray-100",
        muted: "text-gray-400",
        subtle: "text-gray-500",
        border: "border-white/10",
        link: "transition hover:text-white",
        logo: "",
    },
};

export default function Footer({ theme = "light" }: FooterProps) {
    const t = themes[theme];
    return (
        <footer className={t.footer}>
            <div className="px-8">
                <div className="container mx-auto flex flex-col gap-10 py-12 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-xs">
                        <Image src="/Logo.svg" alt="Alpine Shell Logo" width={170} height={50} className={t.logo} />
                        <p className={`mt-4 text-sm ${t.muted}`}>
                            Who are we? People who care about your experience.
                        </p>
                    </div>

                    <nav className={`flex flex-col gap-3 text-sm ${t.muted}`}>
                        <Link href="/" className={t.link}>Home</Link>
                        <Link href="/plugins" className={t.link}>Plugins</Link>
                        <Link href="/docs" className={t.link}>Docs</Link>
                    </nav>
                </div>
            </div>

            <div className={`border-t ${t.border}`}>
                <div className="px-8">
                    <div className={`container mx-auto flex flex-col items-center justify-between gap-2 py-6 text-xs ${t.subtle} sm:flex-row`}>
                        <p>© {new Date().getFullYear()} Alpine Shell. All rights reserved.</p>
                        <Link href="/terms" className={t.link}>Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
