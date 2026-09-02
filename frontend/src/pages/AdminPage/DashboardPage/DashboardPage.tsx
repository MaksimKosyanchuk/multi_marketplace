import React, { useEffect, useState, useCallback } from 'react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { Button } from '../../../components/Ui/Button/Button';
import { analyticsService, type DashboardData } from '../../../services/analyticsService';
import styles from './DashboardPage.module.css';

export default function DashBoardPage(): React.ReactNode {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                ...(fromDate && { from: fromDate }),
                ...(toDate && { to: toDate }),
            };
            const result = await analyticsService.getDashboardData(params);
            setData(result);
        } catch (error) {
            console.error('Failed to load analytics:', error);
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => {
        let isMounted = true;

        const loadDashboard = async () => {
            setLoading(true);
            try {
                const params = {
                    ...(fromDate && { from: fromDate }),
                    ...(toDate && { to: toDate }),
                };
                const result = await analyticsService.getDashboardData(params);
                if (isMounted) {
                    setData(result);
                }
            } catch (error) {
                if (isMounted) {
                    console.error('Failed to load analytics:', error);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void loadDashboard();

        return () => {
            isMounted = false;
        };
    }, [fromDate, toDate]);

    const handleExportCsv = async () => {
        setIsExporting(true);
        try {
            const params = {
                ...(fromDate && { from: fromDate }),
                ...(toDate && { to: toDate }),
            };
            await analyticsService.downloadOrdersCsv(params);
        } catch (error) {
            console.error('Failed to export CSV:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const formatTooltipValue = (value: ValueType | undefined): [string, NameType] => {
        const numericVal = typeof value === 'number' ? value : Number(value) || 0;
        return [`$${numericVal.toFixed(2)}`, 'Виручка'];
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>Аналітика продажів</h1>
                <Button 
                    variant="secondary" 
                    onClick={handleExportCsv}
                    disabled={isExporting}
                >
                    {isExporting ? 'Завантаження...' : '📥 Експорт в CSV'}
                </Button>
            </header>

            <section className={styles.filters}>
                <div className={styles.filterGroup}>
                    <label htmlFor="fromDate">З:</label>
                    <input
                        id="fromDate"
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                    />
                </div>
                <div className={styles.filterGroup}>
                    <label htmlFor="toDate">По:</label>
                    <input
                        id="toDate"
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                    />
                </div>
                <Button variant="primary" size="small" onClick={fetchAnalytics}>
                    Застосувати
                </Button>
            </section>

            {loading || !data ? (
                <div className={styles.loader}>Завантаження аналітики...</div>
            ) : (
                <main className={styles.contentGrid}>
                    <section className={styles.kpiGrid}>
                        <div className={styles.kpiCard}>
                            <span className={styles.kpiLabel}>Загальна виручка</span>
                            <strong className={styles.kpiValue}>
                                ${data.summary.totalRevenue.toFixed(2)}
                            </strong>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.kpiLabel}>Оформлено замовлень</span>
                            <strong className={styles.kpiValue}>
                                {data.summary.totalOrders}
                            </strong>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.kpiLabel}>Середній чек</span>
                            <strong className={styles.kpiValue}>
                                ${data.summary.averageOrderValue.toFixed(2)}
                            </strong>
                        </div>
                    </section>

                    <section className={styles.chartSection}>
                        <h3>Динаміка виручки ($)</h3>
                        <div className={styles.chartWrapper}>
                            {data.salesTimeline.length === 0 ? (
                                <p className={styles.emptyText}>Немає даних за обраний період</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={320}>
                                    <AreaChart data={data.salesTimeline}>
                                        <defs>
                                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" />
                                        <YAxis />
                                        <Tooltip formatter={formatTooltipValue} />
                                        <Area
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="#3b82f6"
                                            fillOpacity={1}
                                            fill="url(#colorRev)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </section>

                    <section className={styles.topSection}>
                        <h3>Топ-5 товарів за продажами</h3>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Назва товару</th>
                                        <th>Продано (шт)</th>
                                        <th>Сума ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topProducts.map((p) => (
                                        <tr key={p.productId}>
                                            <td>{p.productName}</td>
                                            <td>{p.totalSold}</td>
                                            <td>${p.totalRevenue.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {data.topProducts.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className={styles.emptyTableCell}>
                                                Немає проданних товарів
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            )}
        </div>
    );
}