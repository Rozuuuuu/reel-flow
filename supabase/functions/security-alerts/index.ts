import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

interface ScanRow {
  id: string;
  scanner: string;
  status: string;
  suite: string;
  findings_high: number;
  findings_critical: number;
  open_issues: number;
  baseline_diff: string;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const bodyFor = (kind: string, scan: ScanRow) => {
  const title =
    kind === 'failed'
      ? `Security scan failed: ${scan.scanner}`
      : `Security scan pending: ${scan.scanner}`;
  const html = `
    <h2>${esc(title)}</h2>
    <ul>
      <li><strong>Scanner:</strong> ${esc(scan.scanner)}</li>
      <li><strong>Suite:</strong> ${esc(scan.suite)}</li>
      <li><strong>Status:</strong> ${esc(scan.status)}</li>
      <li><strong>High / critical:</strong> ${scan.findings_high} / ${scan.findings_critical}</li>
      <li><strong>Open issues:</strong> ${scan.open_issues}</li>
      <li><strong>Baseline diff:</strong> ${esc(scan.baseline_diff)}</li>
      <li><strong>Started:</strong> ${esc(scan.started_at)}</li>
    </ul>
    ${scan.notes ? `<p>${esc(scan.notes)}</p>` : ''}
  `;
  return { subject: title, html };
};

const driftBody = (
  rows: { table_name: string; grantee: string; status: string }[],
) => {
  const subject = `Security alert: ${rows.length} permission drift issue${rows.length === 1 ? '' : 's'}`;
  const html = `
    <h2>${esc(subject)}</h2>
    <p>Live table permissions no longer match the expected security matrix.</p>
    <ul>
      ${rows
        .map(
          (r) =>
            `<li><strong>${esc(r.table_name)}</strong> · ${esc(r.grantee)} — ${esc(r.status)}</li>`,
        )
        .join('')}
    </ul>
  `;
  return { subject, html };
};


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Caller must be an authenticated admin.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: isAdmin } = await userClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await admin
      .from('security_alert_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!settings || !settings.enabled) {
      return json({ sent: 0, skipped: 'alerts_disabled' });
    }
    const recipients: string[] = settings.recipients ?? [];
    if (recipients.length === 0) {
      return json({ sent: 0, skipped: 'no_recipients' });
    }

    const pendingCutoff = new Date(
      Date.now() - (settings.pending_after_minutes ?? 30) * 60_000,
    ).toISOString();

    const { data: scans } = await admin
      .from('security_scans')
      .select(
        'id, scanner, status, suite, findings_high, findings_critical, open_issues, baseline_diff, notes, started_at, completed_at',
      )
      .in('status', ['pending', 'running', 'failed'])
      .order('started_at', { ascending: false })
      .limit(50);

    const candidates: { kind: string; scan: ScanRow | null }[] = [];
    for (const s of (scans ?? []) as ScanRow[]) {
      if (s.status === 'failed' && settings.notify_failed) {
        candidates.push({ kind: 'failed', scan: s });
      } else if (
        (s.status === 'pending' || s.status === 'running') &&
        settings.notify_pending &&
        s.started_at <= pendingCutoff
      ) {
        candidates.push({ kind: 'pending', scan: s });
      }
    }

    // Permission drift: compare live grants to the expected matrix.
    let driftRows: { table_name: string; grantee: string; status: string }[] = [];
    if (settings.notify_drift) {
      const { data: drift } = await userClient.rpc('matrix_grant_drift');
      driftRows = ((drift ?? []) as typeof driftRows).filter(
        (d) => d.status !== 'ok',
      );
      if (driftRows.length > 0) {
        const since = new Date(Date.now() - 60 * 60_000).toISOString();
        const { data: recentDrift } = await admin
          .from('security_alerts_sent')
          .select('id')
          .eq('kind', 'drift')
          .gte('created_at', since)
          .limit(1);
        if (!recentDrift || recentDrift.length === 0) {
          candidates.push({ kind: 'drift', scan: null });
        }
      }
    }

    if (candidates.length === 0) return json({ sent: 0, skipped: 'nothing_to_alert' });

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');

    let sent = 0;
    const results: unknown[] = [];


    for (const { kind, scan } of candidates) {
      const scanId = scan?.id ?? null;
      if (scanId) {
        const { data: already } = await admin
          .from('security_alerts_sent')
          .select('id')
          .eq('scan_id', scanId)
          .eq('kind', kind)
          .maybeSingle();
        if (already) continue;
      }

      const { subject, html } =
        kind === 'drift' ? driftBody(driftRows) : bodyFor(kind, scan!);


      if (!lovableKey || !resendKey) {
        await admin.from('security_alerts_sent').insert({
          scan_id: scanId,
          kind,
          recipients,
          subject,
          status: 'failed',
          error: 'Email sender not connected (RESEND_API_KEY missing)',
        });
        results.push({ scan: scanId, kind, status: 'failed', error: 'no_email_sender' });
        continue;
      }

      const res = await fetch(`${GATEWAY_URL}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': resendKey,
        },
        body: JSON.stringify({
          from: 'Reelo Security <onboarding@resend.dev>',
          to: recipients,
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`Resend request failed [${res.status}]: ${errorBody}`);
        await admin.from('security_alerts_sent').insert({
          scan_id: scanId,
          kind,
          recipients,
          subject,
          status: 'failed',
          error: `[${res.status}] ${errorBody}`.slice(0, 1000),
        });
        results.push({ scan: scanId, kind, status: 'failed', http: res.status });
        continue;
      }

      const payload = await res.json();
      await admin.from('security_alerts_sent').insert({
        scan_id: scanId,
        kind,
        recipients,
        subject,
        status: 'sent',
        provider_id: payload?.id ?? null,
      });
      sent += 1;
      results.push({ scan: scanId, kind, status: 'sent' });
    }

    return json({ sent, considered: candidates.length, results });
  } catch (e) {
    console.error('security-alerts error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
