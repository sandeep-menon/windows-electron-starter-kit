import "./assets/main.css";

import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { globalErrorLogging } from "./lib/errorLogging";

globalErrorLogging();

const Child = lazy(() => import("./Child"));
const Toaster = lazy(() => 
    import("./components/ui/sonner").then((m) => ({ default: m.Toaster }))
);

const Root = window.location.hash === "#child" ? Child : App;

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider defaultTheme="system">
            <ErrorBoundary>
                <Suspense fallback={null}>
                    <Root />
                </Suspense>
            </ErrorBoundary>
            <Suspense fallback={null}>
                <Toaster richColors />
            </Suspense>
        </ThemeProvider>
    </StrictMode>
)