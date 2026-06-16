import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { readFileSync } from 'node:fs';
const region = process.env.AWS_REGION || 'us-east-1';
const instanceId = 'i-0c52851f134db20ee';
const commands = [readFileSync(process.argv[2], 'utf8')];
const ssm = new SSMClient({ region });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = await ssm.send(
  new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: { commands, executionTimeout: ['600'] },
  })
);
const cmdId = send.Command.CommandId;
for (let i = 0; i < 60; i++) {
  await sleep(3000);
  try {
    const inv = await ssm.send(
      new GetCommandInvocationCommand({ CommandId: cmdId, InstanceId: instanceId })
    );
    if (['Success', 'Failed', 'Cancelled', 'TimedOut'].includes(inv.Status)) {
      console.log(`[status=${inv.Status}]`);
      if (inv.StandardOutputContent) console.log(inv.StandardOutputContent);
      if (inv.StandardErrorContent) console.log('STDERR:\n' + inv.StandardErrorContent);
      break;
    }
  } catch (e) {
    if (!String(e).includes('InvocationDoesNotExist')) throw e;
  }
}
