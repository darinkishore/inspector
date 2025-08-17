import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ServerFormData } from "@/shared/types.js";
import { ServerWithName } from "@/hooks/use-app-state";
import { getStoredTokens } from "@/lib/mcp-oauth";

interface EditServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (originalServerName: string, formData: ServerFormData) => void;
  server: ServerWithName;
}

export function EditServerModal({
  isOpen,
  onClose,
  onUpdate,
  server,
}: EditServerModalProps) {
  const [serverFormData, setServerFormData] = useState<ServerFormData>({
    name: "",
    type: "stdio",
    command: "",
    args: [],
    url: "",
    headers: {},
    env: {},
    useOAuth: true,
    oauthScopes: [],
    clientId: "",
  });
  const [commandInput, setCommandInput] = useState("");
  const [oauthScopesInput, setOauthScopesInput] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [authType, setAuthType] = useState<"oauth" | "bearer" | "none">("none");
  const [useCustomClientId, setUseCustomClientId] = useState(false);
  const [clientIdError, setClientIdError] = useState<string | null>(null);
  const [clientSecretError, setClientSecretError] = useState<string | null>(
    null,
  );
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    [],
  );

  // Convert ServerWithName to ServerFormData format
  const convertServerConfig = (server: ServerWithName): ServerFormData => {
    const config = server.config;
    const isHttpServer = "url" in config;

    if (isHttpServer) {
      // Extract bearer token from headers if present
      const headers =
        (config.requestInit?.headers as Record<string, string>) || {};
      const hasOAuth = server.oauthTokens != null;

      // Get stored OAuth client credentials if available
      const storedTokens = hasOAuth ? getStoredTokens(server.name) : null;
      const storedClientInfo = hasOAuth
        ? localStorage.getItem(`mcp-client-${server.name}`)
        : null;
      const clientInfo = storedClientInfo ? JSON.parse(storedClientInfo) : {};

      return {
        name: server.name,
        type: "http",
        url: config.url?.toString() || "",
        headers: headers,
        useOAuth: hasOAuth,
        oauthScopes: server.oauthTokens?.scope?.split(" ") || [],
        clientId:
          "clientId" in config
            ? typeof config.clientId === "string"
              ? config.clientId
              : ""
            : storedTokens?.client_id || clientInfo?.client_id || "",
        clientSecret:
          "clientSecret" in config
            ? typeof config.clientSecret === "string"
              ? config.clientSecret
              : ""
            : clientInfo?.client_secret || "",
      };
    } else {
      // STDIO server
      return {
        name: server.name,
        type: "stdio",
        command: config.command || "",
        args: config.args || [],
        env: config.env || {},
      };
    }
  };

  // Initialize form with server data
  useEffect(() => {
    if (server && isOpen) {
      const formData = convertServerConfig(server);
      setServerFormData(formData);

      // Set additional form state
      if (formData.type === "stdio") {
        const command = formData.command || "";
        const args = formData.args || [];
        setCommandInput([command, ...args].join(" "));

        // Convert env object to key-value pairs
        const envEntries = Object.entries(formData.env || {}).map(
          ([key, value]) => ({
            key,
            value,
          }),
        );
        setEnvVars(envEntries);
      } else {
        // HTTP server
        const headers = formData.headers || {};
        const authHeader = headers.Authorization;
        const hasBearerToken = authHeader?.startsWith("Bearer ");
        const hasOAuth = formData.useOAuth;

        if (hasOAuth) {
          setAuthType("oauth");
          setOauthScopesInput(formData.oauthScopes?.join(" ") || "mcp:*");
          // Initialize clientId and useCustomClientId
          setClientId(formData.clientId || "");
          setClientSecret(formData.clientSecret || "");
          setUseCustomClientId(!!formData.clientId);
          // Ensure useOAuth is true when we have OAuth tokens
          setServerFormData((prev) => ({ ...prev, useOAuth: true }));
        } else if (hasBearerToken) {
          setAuthType("bearer");
          setBearerToken(authHeader.slice(7)); // Remove 'Bearer ' prefix
          // Ensure useOAuth is false for bearer token
          setServerFormData((prev) => ({ ...prev, useOAuth: false }));
        } else {
          setAuthType("none");
          // Ensure useOAuth is false for no auth
          setServerFormData((prev) => ({ ...prev, useOAuth: false }));
        }
      }
    }
  }, [server, isOpen]);

  // Basic client ID validation
  const validateClientId = (id: string): string | null => {
    if (!id.trim()) {
      return "Client ID is required when using manual configuration";
    }

    // Basic format validation - most OAuth providers use alphanumeric with hyphens/underscores
    const validPattern =
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
    if (!validPattern.test(id.trim())) {
      return "Client ID should contain only letters, numbers, dots, hyphens, and underscores";
    }

    if (id.trim().length < 3) {
      return "Client ID must be at least 3 characters long";
    }

    if (id.trim().length > 100) {
      return "Client ID must be less than 100 characters long";
    }

    return null;
  };

  // Basic client secret validation following OAuth 2.0 spec flexibility
  const validateClientSecret = (secret: string): string | null => {
    // OAuth 2.0 spec doesn't mandate specific format requirements
    // but we implement basic security guidelines
    if (secret && secret.trim().length > 0) {
      if (secret.trim().length < 8) {
        return "Client secret should be at least 8 characters long for security";
      }

      if (secret.trim().length > 512) {
        return "Client secret must be less than 512 characters long";
      }

      // Check for common security issues
      if (secret === secret.toLowerCase() && secret.length < 16) {
        return "Client secret should contain mixed case or be longer for security";
      }
    }

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate Client ID if using custom configuration
    if (authType === "oauth" && useCustomClientId) {
      const clientIdError = validateClientId(clientId);
      if (clientIdError) {
        toast.error(clientIdError);
        return;
      }

      // Validate Client Secret if provided
      if (clientSecret) {
        const clientSecretError = validateClientSecret(clientSecret);
        if (clientSecretError) {
          toast.error(clientSecretError);
          return;
        }
      }
    }

    if (serverFormData.name) {
      let finalFormData = { ...serverFormData };

      if (serverFormData.type === "stdio" && commandInput) {
        const parts = commandInput.split(" ").filter((part) => part.trim());
        const command = parts[0] || "";
        const args = parts.slice(1);
        finalFormData = { ...finalFormData, command, args };

        // Add environment variables for STDIO
        const envObj = envVars.reduce(
          (acc, { key, value }) => {
            if (key && value) acc[key] = value;
            return acc;
          },
          {} as Record<string, string>,
        );
        finalFormData = { ...finalFormData, env: envObj };
      }

      if (serverFormData.type === "http") {
        if (authType === "none") {
          finalFormData = {
            ...finalFormData,
            useOAuth: false,
            headers: {}, // Clear any existing auth headers
          };
        } else if (authType === "bearer" && bearerToken) {
          finalFormData = {
            ...finalFormData,
            headers: {
              ...finalFormData.headers,
              Authorization: `Bearer ${bearerToken}`,
            },
            useOAuth: false,
          };
        } else if (authType === "oauth" && serverFormData.useOAuth) {
          const scopes = (oauthScopesInput || "")
            .split(" ")
            .map((s) => s.trim())
            .filter(Boolean);
          finalFormData = {
            ...finalFormData,
            useOAuth: true,
            ...(scopes.length > 0 ? { oauthScopes: scopes } : {}),
            clientId: useCustomClientId
              ? clientId.trim() || undefined
              : undefined,
            clientSecret: useCustomClientId
              ? clientSecret.trim() || undefined
              : undefined,
            headers: {}, // Clear any existing auth headers for OAuth
          };
        }
      }

      onUpdate(server.name, finalFormData);
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
  };

  const handleClientIdChange = (value: string) => {
    setClientId(value);
    // Clear error when user starts typing
    if (clientIdError) {
      setClientIdError(null);
    }
  };

  const handleClientSecretChange = (value: string) => {
    setClientSecret(value);
    // Clear error when user starts typing
    if (clientSecretError) {
      setClientSecretError(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex text-xl font-semibold">
            <img src="/mcp.svg" alt="MCP" className="mr-2" /> Edit MCP Server
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Server Name
            </label>
            <Input
              value={serverFormData.name}
              onChange={(e) =>
                setServerFormData((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              placeholder="my-mcp-server"
              required
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Connection Type
            </label>
            {serverFormData.type === "stdio" ? (
              <div className="flex">
                <Select
                  value={serverFormData.type}
                  onValueChange={(value: "stdio" | "http") =>
                    setServerFormData((prev) => ({
                      ...prev,
                      type: value,
                    }))
                  }
                >
                  <SelectTrigger className="w-22 rounded-r-none border-r-0 text-xs border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">STDIO</SelectItem>
                    <SelectItem value="http">HTTP/SSE</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="npx -y @modelcontextprotocol/server-everything"
                  required
                  className="flex-1 rounded-l-none text-sm border-border"
                />
              </div>
            ) : (
              <div className="flex">
                <Select
                  value={serverFormData.type}
                  onValueChange={(value: "stdio" | "http") =>
                    setServerFormData((prev) => ({
                      ...prev,
                      type: value,
                    }))
                  }
                >
                  <SelectTrigger className="w-22 rounded-r-none border-r-0 text-xs border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">STDIO</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={serverFormData.url}
                  onChange={(e) =>
                    setServerFormData((prev) => ({
                      ...prev,
                      url: e.target.value,
                    }))
                  }
                  placeholder="http://localhost:8080/mcp"
                  required
                  className="flex-1 rounded-l-none text-sm"
                />
              </div>
            )}
          </div>

          {serverFormData.type === "stdio" && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30 border-border/50">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  Environment Variables
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEnvVar}
                  className="h-8 px-2 text-xs cursor-pointer"
                >
                  Add Variable
                </Button>
              </div>
              {envVars.length > 0 && (
                <div className="space-y-2">
                  {envVars.map((envVar, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="key"
                        value={envVar.key}
                        onChange={(e) =>
                          updateEnvVar(index, "key", e.target.value)
                        }
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="value"
                        value={envVar.value}
                        onChange={(e) =>
                          updateEnvVar(index, "value", e.target.value)
                        }
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeEnvVar(index)}
                        className="h-8 px-2 text-xs"
                      >
                        �
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {serverFormData.type === "http" && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30 border-border/50">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">
                  Authentication Method
                </label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="none"
                      name="authType"
                      checked={authType === "none"}
                      onChange={() => {
                        setAuthType("none");
                        setServerFormData((prev) => ({
                          ...prev,
                          useOAuth: false,
                        }));
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="none" className="text-sm cursor-pointer">
                      None
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="oauth"
                      name="authType"
                      checked={authType === "oauth"}
                      onChange={() => {
                        setAuthType("oauth");
                        setServerFormData((prev) => ({
                          ...prev,
                          useOAuth: true,
                        }));
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="oauth" className="text-sm cursor-pointer">
                      OAuth 2.1
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="bearer"
                      name="authType"
                      checked={authType === "bearer"}
                      onChange={() => {
                        setAuthType("bearer");
                        setServerFormData((prev) => ({
                          ...prev,
                          useOAuth: false,
                        }));
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="bearer" className="text-sm cursor-pointer">
                      Bearer Token
                    </label>
                  </div>
                </div>
              </div>

              {authType === "oauth" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      OAuth Scopes
                    </label>
                    <Input
                      value={oauthScopesInput}
                      onChange={(e) => setOauthScopesInput(e.target.value)}
                      placeholder="mcp:* mcp:tools mcp:resources"
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Space-separated OAuth scopes. Use &apos;mcp:*&apos; for
                      full access.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-foreground">
                        Client Registration Method
                      </label>
                      <div className="flex items-center space-x-6">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="dynamic-registration"
                            name="clientRegistration"
                            checked={!useCustomClientId}
                            onChange={() => setUseCustomClientId(false)}
                            className="w-4 h-4 cursor-pointer"
                          />
                          <label
                            htmlFor="dynamic-registration"
                            className="text-sm cursor-pointer"
                          >
                            Dynamic Registration
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="manual-client-id"
                            name="clientRegistration"
                            checked={useCustomClientId}
                            onChange={() => setUseCustomClientId(true)}
                            className="w-4 h-4 cursor-pointer"
                          />
                          <label
                            htmlFor="manual-client-id"
                            className="text-sm cursor-pointer"
                          >
                            Manual Client Credentials
                          </label>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Dynamic registration lets the server automatically
                        assign a client ID. Manual configuration allows you to
                        specify a pre-registered client credentials.
                      </p>
                    </div>

                    {useCustomClientId && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">
                            Client ID <span className="text-red-500">*</span>
                          </label>
                          <Input
                            value={clientId}
                            onChange={(e) =>
                              handleClientIdChange(e.target.value)
                            }
                            placeholder="your-registered-client-id"
                            className={`h-10 ${clientIdError ? "border-red-500 focus:border-red-500" : ""}`}
                            required={useCustomClientId}
                          />
                          {clientIdError ? (
                            <p className="text-xs text-red-600">
                              {clientIdError}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Enter the client ID that was pre-registered with
                              the OAuth provider. This must match exactly what
                              was configured on the server.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">
                            Client Secret
                          </label>
                          <Input
                            type="password"
                            value={clientSecret}
                            onChange={(e) =>
                              handleClientSecretChange(e.target.value)
                            }
                            placeholder="your-client-secret"
                            className={`h-10 ${clientSecretError ? "border-red-500 focus:border-red-500" : ""}`}
                          />
                          {clientSecretError ? (
                            <p className="text-xs text-red-600">
                              {clientSecretError}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Optional. Enter the client secret if your OAuth
                              provider requires it for authentication.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {authType === "bearer" && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Bearer Token
                  </label>
                  <Input
                    type="password"
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="Enter your bearer token"
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Token will be sent as Authorization: Bearer &lt;token&gt;
                    header
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-6 border-t">
            <Button type="submit" className="flex-1 cursor-pointer">
              Update Server
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
