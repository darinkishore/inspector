import { ScrollText } from "lucide-react";
import { CompatibilityCallToolResult } from "@modelcontextprotocol/sdk/types.js";
import ToolResult from "./ToolResult";

interface ToolResultsPanelProps {
  toolResult: CompatibilityCallToolResult | null;
  selectedTool: string | null;
}

const ToolResultsPanel = ({
  toolResult,
  selectedTool,
}: ToolResultsPanelProps) => {
  const renderStatusIndicator = () => {
    if (toolResult && !toolResult.isError) {
      return <div className="w-2 h-2 bg-green-500 rounded-full"></div>;
    } else if (toolResult && toolResult.isError) {
      return <div className="w-2 h-2 bg-red-500 rounded-full"></div>;
    } else {
      return null;
    }
  };

  return (
    <div className="flex flex-col bg-card border border-border rounded-lg overflow-hidden h-full">
      {/* Header */}
      <div className="p-3 border-b border-border/50 bg-muted/30">
        <div className="flex items-center space-x-2">
          <ScrollText className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Tool Results</h3>
          {selectedTool && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {selectedTool}
            </span>
          )}
          {renderStatusIndicator()}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!toolResult ? (
          <div className="flex flex-col items-center justify-center py-12 text-center h-full">
            <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-4">
              <span className="text-2xl">🎯</span>
            </div>
            <p className="text-muted-foreground text-lg font-medium mb-2">
              No results yet
            </p>
            <p className="text-muted-foreground/60 text-sm">
              Tool results will appear here after running a tool
            </p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-background/80 to-background/60 backdrop-blur-sm p-4 rounded-xl border border-border/30">
            <ToolResult toolResult={toolResult} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolResultsPanel;
