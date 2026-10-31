import { expect, it } from 'vitest';
import { escapeHtml } from './invoices';
it('escapes hostile invoice snapshot text before HTML interpolation',()=>{expect(escapeHtml('<script src="x">&\'</script>')).toBe('&lt;script src=&quot;x&quot;&gt;&amp;&#39;&lt;/script&gt;');});
