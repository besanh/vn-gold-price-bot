export type GoldItem = {
    source: string;
    type: string;
    name: string;
    buy: number;
    sell: number;
    change_sell: number;
    change_buy: number;
    delta_sell: number;
    delta_buy: number;
    time: string;
    date: string;
};

export type HistoryData = Record<string, { t: number, p: number }[]>;
