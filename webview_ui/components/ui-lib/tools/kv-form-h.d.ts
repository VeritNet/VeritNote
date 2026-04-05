export interface KvFormItem {
    name: string;
    type: 'chk' | 'tgl' | 'text' | 'num' | 'sel' | 'combo' | 'seg' | 'color';
    display?: string;
    describe?: string;
    value?: any;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    values?: (string | number | { value: string | number; display: string })[];
    condition?: string | number | boolean;
    children?: KvFormItem[];
}