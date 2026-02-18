import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type { Host, HostPowerAction, HostPowerControlConfig } from '@kaonis/woly-protocol';
import { logger } from '../utils/logger';

const execFile = promisify(execFileCallback);

const DEFAULT_SSH_PORT = 22;
const SSH_CONNECT_TIMEOUT_SECONDS = 10;
const SSH_EXEC_TIMEOUT_MS = 30_000;
const SSH_MAX_BUFFER_BYTES = 256 * 1024;

const DEFAULT_HOST_POWER_COMMANDS: Record<HostPowerControlConfig['platform'], Record<HostPowerAction, string>> = {
  linux: {
    sleep: 'systemctl suspend',
    shutdown: 'shutdown -h now',
  },
  macos: {
    sleep: 'pmset sleepnow',
    shutdown: 'shutdown -h now',
  },
  windows: {
    sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
    shutdown: 'shutdown /s /t 0 /f',
  },
};

const HOST_KEY_CHECKING_ARGS: Record<NonNullable<HostPowerControlConfig['ssh']['strictHostKeyChecking']>, string[]> = {
  enforce: ['-o', 'StrictHostKeyChecking=yes'],
  'accept-new': ['-o', 'StrictHostKeyChecking=accept-new'],
  off: ['-o', 'StrictHostKeyChecking=no'],
};

type HostPowerExecutionPlan = {
  target: string;
  sshArgs: string[];
  remoteCommand: string;
};

function resolvePowerConfig(host: Host): HostPowerControlConfig {
  const powerControl = host.powerControl;
  if (!powerControl) {
    throw new Error(`Host '${host.name}' does not have power control configured`);
  }

  if (!powerControl.enabled) {
    throw new Error(`Power control is disabled for host '${host.name}'`);
  }

  if (powerControl.transport !== 'ssh') {
    throw new Error(
      `Unsupported power control transport '${String(powerControl.transport)}' for host '${host.name}'`
    );
  }

  return powerControl;
}

export function resolveHostPowerExecutionPlan(host: Host, action: HostPowerAction): HostPowerExecutionPlan {
  if (!host.ip || host.ip.trim().length === 0) {
    throw new Error(`Host '${host.name}' does not have a valid IP address`);
  }

  const powerControl = resolvePowerConfig(host);
  const ssh = powerControl.ssh;

  if (!ssh.username || ssh.username.trim().length === 0) {
    throw new Error(`Host '${host.name}' is missing ssh.username in power control configuration`);
  }

  const port = ssh.port ?? DEFAULT_SSH_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Host '${host.name}' has invalid ssh.port value (${String(port)})`);
  }

  const defaultCommand = DEFAULT_HOST_POWER_COMMANDS[powerControl.platform][action];
  const overrideCommand = powerControl.commands?.[action];
  const remoteCommand = overrideCommand && overrideCommand.trim().length > 0
    ? overrideCommand.trim()
    : defaultCommand;

  if (!remoteCommand || remoteCommand.trim().length === 0) {
    throw new Error(`No SSH command resolved for '${action}' on host '${host.name}'`);
  }

  const sshArgs: string[] = [
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS}`,
    ...HOST_KEY_CHECKING_ARGS[ssh.strictHostKeyChecking ?? 'enforce'],
    '-p',
    String(port),
  ];

  if (ssh.privateKeyPath && ssh.privateKeyPath.trim().length > 0) {
    sshArgs.push('-i', ssh.privateKeyPath.trim());
  }

  const target = `${ssh.username.trim()}@${host.ip.trim()}`;
  sshArgs.push(target, remoteCommand);

  return {
    target,
    sshArgs,
    remoteCommand,
  };
}

export async function executeHostPowerAction(host: Host, action: HostPowerAction): Promise<{ message: string }> {
  const plan = resolveHostPowerExecutionPlan(host, action);

  logger.info('Executing host power action over SSH', {
    hostName: host.name,
    action,
    target: plan.target,
    platform: host.powerControl?.platform,
  });

  try {
    await execFile('ssh', plan.sshArgs, {
      timeout: SSH_EXEC_TIMEOUT_MS,
      maxBuffer: SSH_MAX_BUFFER_BYTES,
      windowsHide: true,
      encoding: 'utf8',
    });
  } catch (error) {
    const typedError = error as {
      message?: string;
      stderr?: string;
      stdout?: string;
      signal?: string;
    };
    const stderr = typeof typedError.stderr === 'string' ? typedError.stderr.trim() : '';
    const stdout = typeof typedError.stdout === 'string' ? typedError.stdout.trim() : '';
    const reason = stderr || stdout || typedError.message || 'unknown error';

    throw new Error(`SSH ${action} command failed for host '${host.name}': ${reason}`, {
      cause: error,
    });
  }

  return {
    message: `Remote ${action} command executed for ${host.name}`,
  };
}
