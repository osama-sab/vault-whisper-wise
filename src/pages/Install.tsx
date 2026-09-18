import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Smartphone, Share, Plus } from "lucide-react";

export default function InstallPage() {
  const [deferred, setDeferred] = useState<any>(null);
  const [isIOS] = useState(() => /iPhone|iPad|iPod/.test(navigator.userAgent));

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background p-6 max-w-md mx-auto">
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground mb-6">
        <ArrowLeft size={14} className="mr-1" /> Back
      </Link>
      <div className="text-center space-y-2 mb-8">
        <div className="w-20 h-20 rounded-3xl bg-primary mx-auto flex items-center justify-center text-primary-foreground">
          <Smartphone size={36} />
        </div>
        <h1 className="text-2xl font-bold mt-4">Install Pocket Money</h1>
        <p className="text-muted-foreground text-sm">
          Add to your home screen for an offline, app-like experience.
        </p>
      </div>

      {isIOS ? (
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3 bg-card border border-border rounded-xl p-3">
            <span className="font-bold text-primary">1.</span>
            <span>Tap the <Share size={14} className="inline" /> Share button in Safari.</span>
          </li>
          <li className="flex gap-3 bg-card border border-border rounded-xl p-3">
            <span className="font-bold text-primary">2.</span>
            <span>Choose <b>Add to Home Screen</b> <Plus size={14} className="inline" />.</span>
          </li>
          <li className="flex gap-3 bg-card border border-border rounded-xl p-3">
            <span className="font-bold text-primary">3.</span>
            <span>Tap <b>Add</b> in the top-right corner.</span>
          </li>
        </ol>
      ) : deferred ? (
        <Button
          className="w-full"
          onClick={async () => {
            deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }}
        >
          Install app
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground text-center">
          Open your browser menu and choose <b>"Install app"</b> or <b>"Add to Home Screen"</b>.
        </p>
      )}
    </div>
  );
}