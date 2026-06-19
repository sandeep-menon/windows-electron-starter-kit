import "./assets/main.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./components/theme-provider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { globalErrorLogging } from "./lib/errorLogging";
import Child from "./Child";

globalErrorLogging();

// Pick the root component from the URL hash the main process set
// (#main, #child). Read synchronously so the correct tree renders on the first paint
const Root = window.location.hash === "#child" ? Child : App;

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider defaultTheme="system">
            <ErrorBoundary>
                <Root />
            </ErrorBoundary>
            <Toaster richColors />
        </ThemeProvider>
    </StrictMode>
);
