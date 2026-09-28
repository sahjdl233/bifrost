import { getErrorMessage, useAppSelector, useUpdatePluginMutation } from "@/lib/store";
import { MaximConfigSchema, MaximFormSchema } from "@/lib/types/schemas";
import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MaximFormFragment } from "../../fragments/maximFormFragment";

interface MaximViewProps {
	onDelete?: () => void;
	isDeleting?: boolean;
}

export default function MaximView({ onDelete, isDeleting }: MaximViewProps) {
	const { t } = useTranslation();
	const selectedPlugin = useAppSelector((state) => state.plugin.selectedPlugin);
	const [updatePlugin] = useUpdatePluginMutation();
	const currentConfig = useMemo(
		() => ({ ...((selectedPlugin?.config as MaximConfigSchema) ?? {}), enabled: selectedPlugin?.enabled }),
		[selectedPlugin],
	);

	const handleMaximConfigSave = (config: MaximFormSchema): Promise<void> => {
		return new Promise((resolve, reject) => {
			updatePlugin({
				name: "maxim",
				data: {
					enabled: config.enabled,
					config: config.maxim_config,
				},
			})
				.unwrap()
				.then(() => {
					toast.success(t("observability.maxim.configUpdated", "Maxim configuration updated successfully"));
					resolve();
				})
				.catch((err) => {
					toast.error(t("observability.maxim.configUpdateFailed", "Failed to update Maxim configuration"), {
						description: getErrorMessage(err),
					});
					reject(err);
				});
		});
	};

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex w-full flex-col gap-2">
				<div className="text-muted-foreground text-xs font-medium">{t("observability.maxim.configuration", "Configuration")}</div>
				<div className="text-muted-foreground mb-2 text-xs font-normal">
					<Trans
						t={t}
						i18nKey="observability.maxim.logRepoHeaderDescription"
						defaults="You can send in header <1>x-bf-log-repo-id</1> with a repository ID to log to a specific repository."
						components={{ 1: <code /> }}
					>
						You can send in header <code>x-bf-log-repo-id</code> with a repository ID to log to a specific repository.
					</Trans>
				</div>
				<MaximFormFragment onSave={handleMaximConfigSave} initialConfig={currentConfig} onDelete={onDelete} isDeleting={isDeleting} />
			</div>
		</div>
	);
}
