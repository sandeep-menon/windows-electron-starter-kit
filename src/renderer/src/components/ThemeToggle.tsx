import type { ReactElement } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";

export default function ThemeToggle(): ReactElement {
    const { theme, setTheme } = useTheme();

    const isDark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    const label = isDark ? "Switch to light mode" : "Switch to dark mode";

    return (
        <Button
            variant="outline"
            size="icon"
            aria-label={label}
            title={label}
            onClick={() => setTheme(isDark ? "light" : "dark")}
        >
            {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </Button>
    );
}
