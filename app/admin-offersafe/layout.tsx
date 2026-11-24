/** Admin pages keep their own markup; this only gives them the standard page width. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="container-page">{children}</div>;
}
