import { Injectable, Logger, Scope } from '@nestjs/common';

export interface TraceContext {
  traceId?: string;
  tenantId?: string;
  conversationId?: string;
  messageId?: string;
  wamid?: string;
  jobId?: string;
}

@Injectable({ scope: Scope.TRANSIENT })
export class TraceLogger extends Logger {
  private traceMeta: TraceContext = {};

  /**
   * Public wrapper to set the standard Nest context
   */
  setContext(context: string) {
    this.context = context;
  }

  /**
   * Set specific tracing metadata (traceId, tenantId, etc.)
   */
  setTraceMetadata(meta: TraceContext) {
    this.traceMeta = { ...this.traceMeta, ...meta };
  }

  private formatMeta(): string {
    const parts: string[] = [];
    if (this.traceMeta.traceId) parts.push(`tr:${this.traceMeta.traceId}`);
    if (this.traceMeta.tenantId) parts.push(`te:${this.traceMeta.tenantId}`);
    if (this.traceMeta.messageId) parts.push(`msg:${this.traceMeta.messageId}`);
    if (this.traceMeta.wamid) parts.push(`wa:${this.traceMeta.wamid}`);
    
    return parts.length > 0 ? `[${parts.join(' ')}] ` : '';
  }

  log(message: any, context?: string) {
    super.log(`${this.formatMeta()}${message}`, context || this.context);
  }

  error(message: any, stack?: string, context?: string) {
    super.error(`${this.formatMeta()}${message}`, stack, context || this.context);
  }

  warn(message: any, context?: string) {
    super.warn(`${this.formatMeta()}${message}`, context || this.context);
  }

  debug(message: any, context?: string) {
    super.debug(`${this.formatMeta()}${message}`, context || this.context);
  }

  verbose(message: any, context?: string) {
    super.verbose(`${this.formatMeta()}${message}`, context || this.context);
  }
}
