import Image from "next/image"
import Link from "next/link"

export default function NavBar() {
    return (
        <nav className="text-white p-8">
            <div className="container mx-auto flex items-center justify-between">
                <Link href="/">
                    <Image src="/Logo.svg" alt="Alpine Shell Logo" width={100} height={50} />
                </Link>
                <div>
                    <a href="#" className="px-4 rounded">Home</a>
                    <a href="#" className="px-4 rounded">Features</a>
                    <a href="#" className="px-4 rounded">Pricing</a>
                    <a href="#" className="px-4 rounded">Contact</a>
                </div>
                <button className="border border-white py-2 px-4 rounded-full">
                    <p>Get your PC back</p>
                </button>
            </div>
        </nav>
    );
}