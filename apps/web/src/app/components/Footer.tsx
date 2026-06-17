import Image from "next/image";
import Link from "next/link";

export default function Footer() {
    return (
        <footer className="bg-white border-t border-black/10 text-gray-900">
            <div className="container mx-auto flex flex-col gap-10 px-8 py-12 md:flex-row md:items-start md:justify-between">
                <div className="max-w-xs">
                    <Image src="/Logo.svg" alt="Alpine Shell Logo" width={150} height={44} className="brightness-0" />
                    <p className="mt-4 text-sm text-gray-600">
                        Who are we? People who care about your experience.
                    </p>
                </div>

                <nav className="flex flex-col gap-3 text-sm text-gray-600">
                    <Link href="/" className="transition hover:text-black">Home</Link>
                    <Link href="#" className="transition hover:text-black">Features</Link>
                    <Link href="#" className="transition hover:text-black">Pricing</Link>
                    <Link href="#" className="transition hover:text-black">Contact</Link>
                </nav>
            </div>

            <div className="border-t border-black/10">
                <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-8 py-6 text-xs text-gray-500 sm:flex-row">
                    <p>© {new Date().getFullYear()} Alpine Shell. All rights reserved.</p>
                    <Link href="/terms" className="transition hover:text-black">Terms of Service</Link>
                </div>
            </div>
        </footer>
    );
}
