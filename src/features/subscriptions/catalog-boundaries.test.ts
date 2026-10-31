import {expect,it} from 'vitest';
import {cloneLines} from './quote-helpers';
it('does not silently turn invalid quantities into billable valid drafts',()=>{const lines=[{productId:'p',variantId:null,quantity:1.5,taxIds:[]}];expect(cloneLines(lines)[0].quantity).toBe(1.5);});
