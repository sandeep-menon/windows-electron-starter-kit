import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        window.api.log.error(`[renderer] UI error boundary: ${error.message}`, {
            stack: error.stack,
            componentStack: errorInfo.componentStack
        });
    }

    render(): ReactNode {
        if (this.state.error) {
            return (<div className="relative z-10 h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
                <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
                <p className="max-w-md text-sm break-words text-muted-foreground">
                    {this.state.error.message}
                </p>
                <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            </div>)
        }
        return this.props.children;
    }
}