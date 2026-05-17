import { Injectable, Logger } from '@nestjs/common';
import { ConversationState } from '@prisma/client';

export enum DomainEvent {
  CUSTOMER_MESSAGE_RECEIVED = 'CUSTOMER_MESSAGE_RECEIVED',
  AGENT_MESSAGE_SENT = 'AGENT_MESSAGE_SENT',
  SYSTEM_MESSAGE_SENT = 'SYSTEM_MESSAGE_SENT',
  CONVERSATION_ARCHIVED = 'CONVERSATION_ARCHIVED',
  CONVERSATION_RESOLVED = 'CONVERSATION_RESOLVED',
  MARK_AS_SPAM = 'MARK_AS_SPAM',
  BLOCK_CONTACT = 'BLOCK_CONTACT',
}

@Injectable()
export class ConversationStateService {
  private readonly logger = new Logger(ConversationStateService.name);

  /**
   * Deterministic state transition map
   */
  private readonly transitions: Record<
    ConversationState,
    Partial<Record<DomainEvent, ConversationState>>
  > = {
    [ConversationState.NEW]: {
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]:
        ConversationState.WAITING_FOR_AGENT,
      [DomainEvent.AGENT_MESSAGE_SENT]: ConversationState.ACTIVE,
      [DomainEvent.SYSTEM_MESSAGE_SENT]: ConversationState.ACTIVE,
    },
    [ConversationState.ACTIVE]: {
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]:
        ConversationState.WAITING_FOR_AGENT,
      [DomainEvent.CONVERSATION_RESOLVED]: ConversationState.RESOLVED,
      [DomainEvent.CONVERSATION_ARCHIVED]: ConversationState.ARCHIVED,
    },
    [ConversationState.WAITING_FOR_AGENT]: {
      [DomainEvent.AGENT_MESSAGE_SENT]: ConversationState.ACTIVE,
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]:
        ConversationState.WAITING_FOR_AGENT, // Stay in waiting
      [DomainEvent.CONVERSATION_RESOLVED]: ConversationState.RESOLVED,
    },
    [ConversationState.WAITING_FOR_CUSTOMER]: {
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]: ConversationState.ACTIVE,
      [DomainEvent.AGENT_MESSAGE_SENT]: ConversationState.WAITING_FOR_CUSTOMER, // Stay in waiting
    },
    [ConversationState.RESOLVED]: {
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]:
        ConversationState.WAITING_FOR_AGENT,
      [DomainEvent.CONVERSATION_ARCHIVED]: ConversationState.ARCHIVED,
    },
    [ConversationState.ARCHIVED]: {
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]:
        ConversationState.WAITING_FOR_AGENT,
    },
    [ConversationState.SPAM]: {
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]: ConversationState.SPAM, // Stay in spam
    },
    [ConversationState.BLOCKED]: {
      [DomainEvent.CUSTOMER_MESSAGE_RECEIVED]: ConversationState.BLOCKED, // Stay in blocked
    },
  };

  /**
   * Calculate the next state based on current state and domain event
   */
  getNextState(
    currentState: ConversationState,
    event: DomainEvent,
    traceId?: string,
  ): ConversationState {
    const nextState = this.transitions[currentState]?.[event];

    if (!nextState) {
      this.logger.warn(
        `[${traceId}] No transition defined for ${currentState} on ${event}. Remaining in current state.`,
      );
      return currentState;
    }

    if (nextState !== currentState) {
      this.logger.log(
        `[${traceId}] Transitioning conversation state: ${currentState} -> ${nextState} via ${event}`,
      );
    }

    return nextState;
  }
}
