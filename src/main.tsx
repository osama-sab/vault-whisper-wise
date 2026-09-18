import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";

// next-themes toggles a `dark` class on <html>, which is exactly what
// tailwind.config.ts's darkMode: ["class"] and the .dark block in index.css
// have been set up for since the project was scaffolded but never wired to.
createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <App />
  </ThemeProvider>
);
