import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Compass } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground p-6">
      <div className="max-w-sm w-full bg-card border border-hairline rounded-panel shadow-panel p-6 text-center">
        <BrandMark size={40} className="mx-auto" />
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Compass size={13} /> Page not found
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nothing lives here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-mono text-[12px] break-all">{location.pathname}</span> is not part of
          the app.
        </p>
        {/* A plain href="/" leaves the app entirely under the app:// protocol
            the desktop build is served from; this stays inside the router. */}
        <Link
          to="/"
          className="mt-5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium px-5 py-2 hover:bg-primary/90 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
