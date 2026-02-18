import express from 'express';
import { inboundCncCommandSchema } from '@kaonis/woly-protocol';
import type { CncCommand } from '../types';
import { agentConfig } from '../config/agent';
import { AppError } from '../middleware/errorHandler';
import { agentCommandAuth } from '../middleware/agentCommandAuth';
import { agentService } from '../services/agentService';

type DispatchableCommand = Extract<CncCommand, { commandId: string }>;

function asDispatchableCommand(command: CncCommand): DispatchableCommand {
  if (!('commandId' in command) || typeof command.commandId !== 'string') {
    throw new AppError('Unsupported command payload for tunnel dispatch', 400, 'BAD_REQUEST');
  }

  return command as DispatchableCommand;
}

const router = express.Router();

router.post('/commands', agentCommandAuth, async (req, res) => {
  if (agentConfig.mode !== 'agent') {
    throw new AppError(
      'Tunnel command dispatch is only available in agent mode',
      409,
      'CONFLICT',
    );
  }

  const parsed = inboundCncCommandSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid command payload', 400, 'BAD_REQUEST');
  }

  const command = asDispatchableCommand(parsed.data);
  const result = await agentService.dispatchTunnelCommand(command);

  res.status(200).json({
    type: 'command-result',
    data: {
      nodeId: agentConfig.nodeId,
      commandId: command.commandId,
      ...result,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
