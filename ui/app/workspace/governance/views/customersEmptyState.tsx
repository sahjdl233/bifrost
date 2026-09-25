import { Button } from "@/components/ui/button";
import { WalletCards } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const CUSTOMERS_DOCS_URL = "https://docs.getbifrost.ai/features/governance/virtual-keys#customers";

interface CustomersEmptyStateProps {
	onAddClick: () => void;
	canCreate?: boolean;
}

export function CustomersEmptyState({ onAddClick, canCreate = true }: CustomersEmptyStateProps) {
	const { t } = useTranslation();
	return (
		<div className="flex min-h-[80vh] w-full flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="text-muted-foreground">
				<WalletCards className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="text-muted-foreground text-xl font-medium">
					{t("governance.customers.emptyTitle", "Customers have their own teams, budgets, and access controls")}
				</h1>
				<div className="text-muted-foreground mx-auto mt-2 w-full max-w-[600px] text-sm font-normal">
					{t(
						"governance.customers.emptyDescription",
						"Create customer accounts to manage multi-tenant usage, assign teams, and set spending and rate limits per customer.",
					)}
				</div>
				<div className="mx-auto mt-6 flex flex-row flex-wrap items-center justify-center gap-2">
					<Button
						variant="outline"
						aria-label={t("governance.customers.readMoreAria", "Read more about customers (opens in new tab)")}
						data-testid="customer-button-read-more"
						onClick={() => {
							window.open(`${CUSTOMERS_DOCS_URL}?utm_source=bfd`, "_blank", "noopener,noreferrer");
						}}
					>
						{t("governance.customers.readMore", "Read more")} <ArrowUpRight className="text-muted-foreground h-3 w-3" />
					</Button>
					<Button
						aria-label={t("governance.customers.addFirstCustomerAria", "Add your first customer")}
						onClick={onAddClick}
						disabled={!canCreate}
						data-testid="customer-button-create"
					>
						{t("governance.customers.addCustomer", "Add Customer")}
					</Button>
				</div>
			</div>
		</div>
	);
}