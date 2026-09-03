import { useEffect, useState } from 'react';
import { Button } from '../../../components/Ui/Button/Button';
import { disputeService } from '../../../services/disputeService';
import type { Dispute, DisputeStatus } from '../../../types/marketplace.type';
import styles from './DisputesPage.module.css';

export default function DisputesPage() {
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            setDisputes(await disputeService.listAll());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const resolve = async (id: string, status: DisputeStatus) => {
        await disputeService.resolve(id, status);
        await load();
    };

    return (
        <div className={styles.container}>
            <h1>Спори</h1>
            {loading ? <p>Завантаження...</p> : disputes.length === 0 ? <p>Спорів немає.</p> : (
                <div className={styles.list}>
                    {disputes.map((dispute) => (
                        <article className={styles.card} key={dispute.id}>
                            <div className={styles.header}>
                                <strong>{dispute.subject}</strong>
                                <span className={`${styles.disputeBadge} ${styles[`dispute${dispute.status}`] ?? ''}`}>
                                    {{
                                        OPEN: 'Відкритий',
                                        UNDER_REVIEW: 'На розгляді',
                                        RESOLVED_FOR_CUSTOMER: 'Вирішено на користь покупця',
                                        RESOLVED_FOR_SELLER: 'Вирішено на користь продавця',
                                        CLOSED: 'Закритий',
                                    }[dispute.status] ?? dispute.status}
                                </span>
                            </div>
                            <p>{dispute.description}</p>
                            {dispute.resolution && <p><b>Рішення:</b> {dispute.resolution}</p>}
                            {(dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW') && (
                                <div className={styles.actions}>
                                    <Button size="small" onClick={() => void resolve(dispute.id, 'RESOLVED_FOR_CUSTOMER')}>
                                        На користь покупця
                                    </Button>
                                    <Button size="small" variant="secondary" onClick={() => void resolve(dispute.id, 'RESOLVED_FOR_SELLER')}>
                                        На користь продавця
                                    </Button>
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
