import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { Sidebar } from "./_components/Sidebar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col text-white">
      <NavBar theme="dark" />
      <div className="flex-1 px-8 pt-28 pb-16">
        <div className="container mx-auto flex gap-10">
          <Sidebar />
          <main className="min-w-0 max-w-3xl flex-1">{children}</main>
        </div>
      </div>
      <Footer theme="dark" />
    </div>
  );
}
