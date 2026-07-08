import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { Sidebar } from "./_components/Sidebar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#050a1a] text-white">
      <NavBar theme="dark" />
      <div className="container mx-auto flex flex-1 gap-10 px-8 pt-28 pb-16">
        <Sidebar />
        <main className="min-w-0 max-w-3xl flex-1">{children}</main>
      </div>
      <Footer theme="dark" />
    </div>
  );
}
