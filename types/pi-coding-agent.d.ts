declare module '@earendil-works/pi-coding-agent' {
  export interface ExtensionAPI {
    registerCommand(
      name: string,
      options: {
        description: string;
        handler: (args: string, ctx: CommandContext) => Promise<void>;
      }
    ): void;
    exec(
      command: string,
      args: string[],
      options?: { timeout?: number }
    ): Promise<{ code: number; stdout: string; stderr: string }>;
    ui: {
      notify(message: string, type: 'info' | 'warning' | 'error'): void;
      setStatus(id: string, status: string | undefined): void;
      select(
        message: string,
        options: string[]
      ): Promise<string | null>;
      input(message: string, placeholder?: string): Promise<string | null>;
      confirm(title: string, message: string): Promise<boolean>;
    };
  }

  export interface CommandContext {
    ui: ExtensionAPI['ui'];
  }
}