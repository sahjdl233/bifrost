import PageTitle from "@/components/pageTitle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecretVarInput } from "@/components/ui/secretVarInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IS_ENTERPRISE } from "@/lib/constants/config";
import { getErrorMessage, useGetCoreConfigQuery, useUpdateCoreConfigMutation } from "@/lib/store";
import { AuthConfig, CoreConfig, DefaultCoreConfig } from "@/lib/types/config";
import { SecretVar } from "@/lib/types/schemas";
import { parseArrayFromText } from "@/lib/utils/array";
import { formatCooldown } from "@/lib/utils/duration";
import { getPasswordPolicyFailures, validateOrigins } from "@/lib/utils/validation";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { useGetAuthTypeQuery } from "@enterprise/lib/store/apis/scimApi";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

// Go duration string: one or more <number><unit> segments, e.g. "5m", "1h30m".
const COOLDOWN_PATTERN = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/;

export default function SecurityView() {
	const { t } = useTranslation();
	const hasSettingsUpdateAccess = useRbac(RbacResource.Settings, RbacOperation.Update);
	const { data: bifrostConfig } = useGetCoreConfigQuery({ fromDB: true });
	const { data: authType, isLoading: authTypeLoading, error: authTypeError } = useGetAuthTypeQuery(undefined, { skip: !IS_ENTERPRISE });
	const config = bifrostConfig?.client_config;
	const [updateCoreConfig, { isLoading }] = useUpdateCoreConfigMutation();
	const [localConfig, setLocalConfig] = useState<CoreConfig>(DefaultCoreConfig);
	const showPasswordSection = !IS_ENTERPRISE || (!authTypeLoading && !authTypeError && authType?.type !== "sso");
	const passwordInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
	const passwordUnchangedRef = useRef(true);

	const [localValues, setLocalValues] = useState<{
		allowed_origins: string;
		allowed_headers: string;
		required_headers: string;
		whitelisted_routes: string;
		vk_rotation_cooldown: string;
	}>({
		allowed_origins: "",
		allowed_headers: "",
		required_headers: "",
		whitelisted_routes: "",
		vk_rotation_cooldown: "",
	});

	const [authConfig, setAuthConfig] = useState<AuthConfig>({
		admin_username: { value: "", ref: "" },
		admin_password: { value: "", ref: "" },
		is_enabled: false,
	});
	const [passwordError, setPasswordError] = useState("");
	const [setupToken, setSetupToken] = useState("");
	const [setupTokenErrorMessage, setSetupTokenErrorMessage] = useState<string | null>(null);
	// No admin account has ever been created on this instance yet. The very first
	// PUT /api/config that creates one must include the setup token the operator
	// configured via setup_token in config.json (or BIFROST_SETUP_TOKEN), so this
	// field only needs to show up that once.
	const isFirstTimeSetup = !bifrostConfig?.auth_config;

	useEffect(() => {
		if (bifrostConfig && config) {
			setLocalConfig(config);
			setLocalValues({
				allowed_origins: config?.allowed_origins?.join(", ") || "",
				allowed_headers: config?.allowed_headers?.join(", ") || "",
				required_headers: config?.required_headers?.join(", ") || "",
				whitelisted_routes: config?.whitelisted_routes?.join(", ") || "",
				vk_rotation_cooldown: formatCooldown(config?.vk_rotation_cooldown),
			});
		}
		if (bifrostConfig?.auth_config) {
			passwordUnchangedRef.current = true;
			setAuthConfig(bifrostConfig.auth_config);
		}
	}, [config, bifrostConfig]);

	const hasChanges = useMemo(() => {
		if (!config) return false;
		const localOrigins = localConfig.allowed_origins?.slice().sort().join(",");
		const serverOrigins = config.allowed_origins?.slice().sort().join(",");
		const originsChanged = localOrigins !== serverOrigins;

		const localHeaders = localConfig.allowed_headers?.slice().sort().join(",");
		const serverHeaders = config.allowed_headers?.slice().sort().join(",");
		const headersChanged = localHeaders !== serverHeaders;

		const usernameChanged =
			authConfig.admin_username?.value !== bifrostConfig?.auth_config?.admin_username?.value ||
			authConfig.admin_username?.ref !== bifrostConfig?.auth_config?.admin_username?.ref ||
			authConfig.admin_username?.type !== bifrostConfig?.auth_config?.admin_username?.type;
		const passwordChanged =
			authConfig.admin_password?.value !== bifrostConfig?.auth_config?.admin_password?.value ||
			authConfig.admin_password?.ref !== bifrostConfig?.auth_config?.admin_password?.ref ||
			authConfig.admin_password?.type !== bifrostConfig?.auth_config?.admin_password?.type;
		const authChanged = showPasswordSection
			? authConfig.is_enabled !== bifrostConfig?.auth_config?.is_enabled || usernameChanged || passwordChanged
			: false;

		const localRequired = localConfig.required_headers?.slice().sort().join(",");
		const serverRequired = config.required_headers?.slice().sort().join(",");
		const requiredChanged = localRequired !== serverRequired;

		const localWhitelistedRoutes = localConfig.whitelisted_routes?.slice().sort().join(",");
		const serverWhitelistedRoutes = config.whitelisted_routes?.slice().sort().join(",");
		const whitelistedRoutesChanged = localWhitelistedRoutes !== serverWhitelistedRoutes;

		const enforceAuthOnInferenceChanged = localConfig.enforce_auth_on_inference !== config.enforce_auth_on_inference;
		const allowDirectKeysChanged = localConfig.allow_direct_keys !== config.allow_direct_keys;
		const dualCredentialConflictBehaviorChanged =
			(localConfig.dual_credential_conflict_behavior || "prefer_idp") !== (config.dual_credential_conflict_behavior || "prefer_idp");
		const vkRotationCooldownChanged = formatCooldown(localConfig.vk_rotation_cooldown) !== formatCooldown(config.vk_rotation_cooldown);

		return (
			originsChanged ||
			headersChanged ||
			requiredChanged ||
			whitelistedRoutesChanged ||
			authChanged ||
			enforceAuthOnInferenceChanged ||
			allowDirectKeysChanged ||
			dualCredentialConflictBehaviorChanged ||
			vkRotationCooldownChanged
		);
	}, [config, localConfig, authConfig, bifrostConfig, showPasswordSection]);

	const needsRestart = useMemo(() => {
		if (!config) return false;

		const localOrigins = localConfig.allowed_origins?.slice().sort().join(",");
		const serverOrigins = config.allowed_origins?.slice().sort().join(",");
		const originsChanged = localOrigins !== serverOrigins;

		const localHeaders = localConfig.allowed_headers?.slice().sort().join(",");
		const serverHeaders = config.allowed_headers?.slice().sort().join(",");
		const headersChanged = localHeaders !== serverHeaders;

		const enforceAuthOnInferenceChanged = localConfig.enforce_auth_on_inference !== config.enforce_auth_on_inference && IS_ENTERPRISE;

		return originsChanged || headersChanged || enforceAuthOnInferenceChanged;
	}, [config, localConfig]);

	const handleAllowedOriginsChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, allowed_origins: value }));
		setLocalConfig((prev) => ({ ...prev, allowed_origins: parseArrayFromText(value) }));
	}, []);

	const handleAllowedHeadersChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, allowed_headers: value }));
		setLocalConfig((prev) => ({ ...prev, allowed_headers: parseArrayFromText(value) }));
	}, []);

	const handleRequiredHeadersChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, required_headers: value }));
		setLocalConfig((prev) => ({ ...prev, required_headers: parseArrayFromText(value) }));
	}, []);

	const handleWhitelistedRoutesChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, whitelisted_routes: value }));
		setLocalConfig((prev) => ({ ...prev, whitelisted_routes: parseArrayFromText(value) }));
	}, []);

	const handleConfigChange = useCallback((field: keyof CoreConfig, value: boolean) => {
		setLocalConfig((prev) => ({ ...prev, [field]: value }));
	}, []);

	const handleVkRotationCooldownChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, vk_rotation_cooldown: value }));
		// The backend accepts Go duration strings; empty input means 0 (disabled).
		setLocalConfig((prev) => ({ ...prev, vk_rotation_cooldown: value.trim() === "" ? 0 : value.trim() }));
	}, []);

	const handleAuthToggle = useCallback((checked: boolean) => {
		setAuthConfig((prev) => ({ ...prev, is_enabled: checked }));
	}, []);

	const handleAuthFieldChange = useCallback(
		(field: "admin_username" | "admin_password", value: SecretVar) => {
			if (field === "admin_password") {
				passwordUnchangedRef.current = false;
				const passwordPolicyFailures = !value.ref && value.value ? getPasswordPolicyFailures(value.value, false) : [];
				setPasswordError(
					passwordPolicyFailures.length > 0
						? t("settings.security.passwordMustInclude", "Password must include {{failures}}.", {
								failures: passwordPolicyFailures.join(", "),
							})
						: "",
				);
			}
			setAuthConfig((prev) => ({ ...prev, [field]: value }));
		},
		[t],
	);

	const handleSave = useCallback(async () => {
		try {
			const validation = validateOrigins(localConfig.allowed_origins);

			if (!validation.isValid && localConfig.allowed_origins.length > 0) {
				toast.error(
					t(
						"settings.security.invalidOrigins",
						'Invalid origins: {{origins}}. Origins must be valid URLs like https://example.com, wildcard patterns like https://*.example.com, or "*" to allow all origins',
						{ origins: validation.invalidOrigins.join(", ") },
					),
				);
				return;
			}
			const cooldownInput = localValues.vk_rotation_cooldown.trim();
			if (cooldownInput !== "" && cooldownInput !== "0" && !COOLDOWN_PATTERN.test(cooldownInput)) {
				toast.error(
					t(
						"settings.security.invalidCooldown",
						'Rotation cooldown must be a duration like "30s", "5m", or "1h30m" (leave empty to disable).',
					),
				);
				return;
			}
			const hasUsername = authConfig.admin_username?.value || authConfig.admin_username?.ref;
			const hasPassword = authConfig.admin_password?.value || authConfig.admin_password?.ref;
			const passwordPolicyFailures =
				showPasswordSection && authConfig.is_enabled && !authConfig.admin_password?.ref && authConfig.admin_password?.value
					? getPasswordPolicyFailures(authConfig.admin_password.value, passwordUnchangedRef.current)
					: [];

			if (passwordPolicyFailures.length > 0) {
				setPasswordError(
					t("settings.security.passwordMustInclude", "Password must include {{failures}}.", {
						failures: passwordPolicyFailures.join(", "),
					}),
				);
				passwordInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
				passwordInputRef.current?.focus({ preventScroll: true });
				return;
			}
			if (isFirstTimeSetup && authConfig.is_enabled && !setupToken.trim()) {
				setSetupTokenErrorMessage(
					t(
						"settings.security.setupTokenErrorDefault",
						"Enter the setup token configured by your operator to create the first admin account. It's set via setup_token in config.json or the BIFROST_SETUP_TOKEN environment variable.",
					),
				);
				return;
			}
			setPasswordError("");

			await updateCoreConfig({
				...bifrostConfig!,
				client_config: localConfig,
				...(showPasswordSection
					? {
							auth_config: {
								...(authConfig.is_enabled && hasUsername && hasPassword ? authConfig : { ...authConfig, is_enabled: false }),
								...(isFirstTimeSetup ? { setup_token: setupToken.trim() } : {}),
							},
						}
					: {}),
			}).unwrap();
			setSetupToken("");
			toast.success(t("settings.security.securitySettingsUpdated", "Security settings updated successfully."));
		} catch (error) {
			const message = getErrorMessage(error);
			if (isFirstTimeSetup && message.toLowerCase().includes("setup token")) {
				setSetupTokenErrorMessage(message);
			} else {
				toast.error(message);
			}
		}
	}, [
		bifrostConfig,
		localConfig,
		localValues.vk_rotation_cooldown,
		authConfig,
		showPasswordSection,
		updateCoreConfig,
		isFirstTimeSetup,
		setupToken,
		t,
	]);

	return (
		<div className="mx-auto w-full max-w-4xl space-y-4">
			<PageTitle title={t("settings.security.title", "Security Settings")}>
				{t("settings.security.subtitle", "Configure security and access control settings.")}
			</PageTitle>

			<div className="space-y-4">
				{/* Password Protect the Dashboard */}
				{IS_ENTERPRISE && authTypeLoading ? (
					<div className="flex items-center justify-center rounded-sm border p-8" data-testid="security-auth-type-loading">
						<Loader2 className="text-muted-foreground h-5 w-5 animate-spin" aria-hidden />
						<span className="sr-only">{t("settings.security.loadingAuthSettings", "Loading authentication settings")}</span>
					</div>
				) : null}
				{IS_ENTERPRISE && !authTypeLoading && authTypeError ? (
					<Alert variant="destructive" data-testid="security-auth-type-error">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							{t(
								"settings.security.authTypeLoadError",
								"Could not load authentication type. Dashboard password settings are hidden until this request succeeds. ",
							)}{" "}
							{getErrorMessage(authTypeError)}
						</AlertDescription>
					</Alert>
				) : null}
				{showPasswordSection && (
					<div>
						<div className="space-y-4 rounded-sm border p-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor="auth-enabled" className="text-sm font-medium">
										{t("settings.security.passwordProtectDashboard", "Password protect the dashboard")}{" "}
										<Badge variant="secondary">BETA</Badge>
									</Label>
									<p className="text-muted-foreground text-sm">
										{t(
											"settings.security.passwordProtectDesc",
											"Set up authentication credentials to protect your Bifrost dashboard. Once configured, use the generated token for all admin API calls.",
										)}
									</p>
								</div>
								<Switch id="auth-enabled" checked={authConfig.is_enabled} onCheckedChange={handleAuthToggle} />
							</div>
							<div className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="admin-username">{t("settings.security.username", "Username")}</Label>
									<SecretVarInput
										id="admin-username"
										type="text"
										placeholder={t("settings.security.usernamePlaceholder", "Enter admin username or env.VAR_NAME")}
										value={authConfig.admin_username}
										disabled={!authConfig.is_enabled}
										onChange={(value) => handleAuthFieldChange("admin_username", value)}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="admin-password">{t("settings.security.password", "Password")}</Label>
									<SecretVarInput
										ref={passwordInputRef}
										id="admin-password"
										aria-invalid={!!passwordError}
										aria-describedby={passwordError ? "admin-password-error" : undefined}
										type="password"
										placeholder={t("settings.security.passwordPlaceholder", "Enter admin password or env.VAR_NAME")}
										value={authConfig.admin_password}
										disabled={!authConfig.is_enabled}
										onChange={(value) => handleAuthFieldChange("admin_password", value)}
									/>
									<p className="text-muted-foreground text-xs">
										{t(
											"settings.security.passwordPolicyHint",
											"Use at least 12 characters with uppercase, lowercase, number, and special character. Env var references are accepted.",
										)}
									</p>
									{passwordError ? (
										<p id="admin-password-error" className="text-destructive text-xs" role="alert">
											{passwordError}
										</p>
									) : null}
								</div>
								{isFirstTimeSetup && authConfig.is_enabled ? (
									<div className="space-y-2">
										<Label htmlFor="setup-token">{t("settings.security.setupToken", "Setup token")}</Label>
										<Input
											id="setup-token"
											data-testid="security-setup-token-input"
											type="password"
											autoComplete="off"
											placeholder={t("settings.security.setupTokenPlaceholder", "Paste the setup token configured by your operator")}
											value={setupToken}
											onChange={(e) => setSetupToken(e.target.value)}
										/>
										<p className="text-muted-foreground text-xs">
											{t(
												"settings.security.setupTokenHint1",
												"No admin account exists yet, so this instance is reachable without a password. To finish setup, ask your operator for the setup token configured via ",
											)}
											<code>setup_token</code>
											{t("settings.security.setupTokenHint2", " in ")}
											<code>config.json</code>
											{t("settings.security.setupTokenHint3", " (or the ")}
											<code>BIFROST_SETUP_TOKEN</code>
											{t("settings.security.setupTokenHint4", " environment variable) and paste it here.")}
										</p>
									</div>
								) : null}
							</div>
						</div>
					</div>
				)}
				{/* Enable Auth on Inference */}
				<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
					<div className="space-y-0.5">
						<label htmlFor="enforce-auth-on-inference" className="text-sm font-medium">
							{IS_ENTERPRISE
								? t("settings.security.enableAuthOnInference", "Enable Auth on Inference")
								: t("settings.security.enforceVirtualKeysOnInference", "Enforce Virtual Keys on Inference")}
						</label>
						<p className="text-muted-foreground text-sm">
							{IS_ENTERPRISE
								? t(
										"settings.security.authOnInferenceDescEnterprise",
										"Require authentication (virtual key, API key, or user token) for all inference endpoints.",
									)
								: t("settings.security.authOnInferenceDescOss", "Require a virtual key for all inference requests.")}{" "}
							{t("settings.security.see", "See")}{" "}
							<a
								href="https://docs.getbifrost.ai/features/governance/virtual-keys"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline"
								data-testid="security-virtual-keys-docs-link"
							>
								{t("settings.security.documentation", "documentation")}
							</a>{" "}
							{t("settings.security.forDetails", "for details.")}
						</p>
					</div>
					<Switch
						id="enforce-auth-on-inference"
						data-testid="enforce-auth-on-inference-switch"
						checked={localConfig.enforce_auth_on_inference}
						onCheckedChange={(checked) => handleConfigChange("enforce_auth_on_inference", checked)}
					/>
				</div>
				{/* Dual Credential Conflict Behavior */}
				{IS_ENTERPRISE && (
					<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="dual-credential-conflict-behavior" className="text-sm font-medium">
								{t("settings.security.dualCredentialConflictBehavior", "Dual Credential Conflict Behavior")}
							</label>
							<p className="text-muted-foreground text-sm">
								{t(
									"settings.security.dualCredDesc1",
									"How to handle inference requests that present both an identity provider access token (",
								)}
								<b>Authorization: Bearer</b>
								{t("settings.security.dualCredDesc2", ") and a virtual key (")}
								<b>x-bf-vk</b>
								{t("settings.security.dualCredDesc3", "). ")}
								<b>{t("settings.security.preferIdpToken", "Prefer IDP token")}</b>{" "}
								{t("settings.security.dualCredDesc4", "uses the user token for identity, ")}
								<b>{t("settings.security.preferVirtualKey", "Prefer virtual key")}</b>{" "}
								{t("settings.security.dualCredDesc5", "drops the IDP token and authenticates via the virtual key, and ")}
								<b>{t("settings.security.rejectRequest", "Reject request")}</b>{" "}
								{t("settings.security.dualCredDesc6", "returns a 400 error.")}
							</p>
						</div>
						<Select
							value={localConfig.dual_credential_conflict_behavior || "prefer_idp"}
							onValueChange={(value) =>
								setLocalConfig((prev) => ({
									...prev,
									dual_credential_conflict_behavior: value as CoreConfig["dual_credential_conflict_behavior"],
								}))
							}
						>
							<SelectTrigger
								id="dual-credential-conflict-behavior"
								data-testid="dual-credential-conflict-behavior-select"
								className="w-full sm:w-[180px]"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="prefer_idp">{t("settings.security.preferIdpToken", "Prefer IDP token")}</SelectItem>
								<SelectItem value="prefer_vk">{t("settings.security.preferVirtualKey", "Prefer virtual key")}</SelectItem>
								<SelectItem value="error">{t("settings.security.rejectRequest", "Reject request")}</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
				{/* Allow Direct API Keys */}
				<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
					<div className="space-y-0.5">
						<label htmlFor="allow-direct-keys" className="text-sm font-medium">
							{t("settings.security.allowDirectKeys", "Allow Direct API Keys")}
						</label>
						<p className="text-muted-foreground text-sm">
							{t("settings.security.allowDirectKeysDesc1", "When enabled, callers can pass a provider API key directly in the ")}
							<b>Authorization</b>, <b>x-api-key</b>,{t("settings.security.allowDirectKeysDesc2", " or ")}
							<b>x-goog-api-key</b>
							{t("settings.security.allowDirectKeysDesc3", " header alongside ")}
							<b>x-bf-direct-key: true</b>
							{t("settings.security.allowDirectKeysDesc4", ". Bifrost will use that key directly, bypassing the registered key pool.")}
						</p>
					</div>
					<Switch
						id="allow-direct-keys"
						data-testid="security-allow-direct-keys-switch"
						checked={localConfig.allow_direct_keys}
						onCheckedChange={(checked) => handleConfigChange("allow_direct_keys", checked)}
					/>
				</div>
				{/* Cooldown After Virtual Key Rotation */}
				<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
					<div className="space-y-0.5">
						<label htmlFor="vk-rotation-cooldown" className="text-sm font-medium">
							{t("settings.security.cooldownAfterRotation", "Cooldown After Virtual Key Rotation")}
						</label>
						<p className="text-muted-foreground text-sm">
							{t(
								"settings.security.cooldownDesc1",
								"After rotating a virtual key, the previous value keeps authenticating for this long, giving callers time to switch to the new key. Use a duration like ",
							)}
							<b>30s</b>, <b>5m</b>,{t("settings.security.cooldownDesc2", " or ")}
							<b>1h</b>
							{t(
								"settings.security.cooldownDesc3",
								". Leave empty (or 0) to have the old value stop working immediately. Maximum 30 days.",
							)}
						</p>
					</div>
					<Input
						id="vk-rotation-cooldown"
						data-testid="security-vk-rotation-cooldown-input"
						className="w-[180px]"
						placeholder="5m"
						value={localValues.vk_rotation_cooldown}
						onChange={(e) => handleVkRotationCooldownChange(e.target.value)}
					/>
				</div>
				{/* Allowed Origins */}
				{needsRestart && <RestartWarning />}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="allowed-origins" className="text-sm font-medium">
								{t("settings.security.allowedOrigins", "Allowed Origins")}
							</label>
							<p className="text-muted-foreground text-sm">
								{t(
									"settings.security.allowedOriginsDesc",
									'Comma-separated list of allowed origins for CORS and WebSocket connections. Localhost origins are always allowed. Each origin must be a complete URL with protocol (e.g., https://app.example.com, http://10.0.0.100:3000). Wildcards are supported for subdomains (e.g., https://*.example.com) or use "*" to allow all origins.',
								)}
							</p>
						</div>
						<Textarea
							id="allowed-origins"
							className="h-24"
							placeholder="https://app.example.com, https://*.example.com, *"
							value={localValues.allowed_origins}
							onChange={(e) => handleAllowedOriginsChange(e.target.value)}
						/>
					</div>
				</div>
				{/* Allowed Headers */}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="allowed-headers" className="text-sm font-medium">
								{t("settings.security.allowedHeaders", "Allowed Headers")}
							</label>
							<p className="text-muted-foreground text-sm">
								{t("settings.security.allowedHeadersDesc", "Comma-separated list of allowed headers for CORS.")}
							</p>
						</div>
						<Textarea
							id="allowed-headers"
							className="h-24"
							placeholder="X-Stainless-Timeout"
							value={localValues.allowed_headers}
							onChange={(e) => handleAllowedHeadersChange(e.target.value)}
						/>
					</div>
				</div>
				{/* Required Headers */}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="required-headers" className="text-sm font-medium">
								{t("settings.security.requiredHeaders", "Required Headers")}
							</label>
							<p className="text-muted-foreground text-sm">
								{t(
									"settings.security.requiredHeadersDesc",
									"Comma-separated list of headers that must be present on every request. Requests missing any of these headers will be rejected with a 400 error. Header names are case-insensitive.",
								)}
							</p>
						</div>
						<Textarea
							id="required-headers"
							data-testid="required-headers-textarea"
							className="h-24"
							placeholder="X-Tenant-ID, X-Custom-Header"
							value={localValues.required_headers}
							onChange={(e) => handleRequiredHeadersChange(e.target.value)}
						/>
					</div>
				</div>
				{/* Whitelisted Routes */}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="whitelisted-routes" className="text-sm font-medium">
								{t("settings.security.whitelistedRoutes", "Whitelisted Routes")}
							</label>
							<p className="text-muted-foreground text-sm">
								{t(
									"settings.security.whitelistedRoutesDesc1",
									"Comma-separated list of routes that bypass the auth middleware. Requests to these routes will not require authentication. System routes like ",
								)}
								<b>/health</b>, <b>/api/session/login</b>,{t("settings.security.whitelistedRoutesDesc2", " and ")}
								<b>/api/session/is-auth-enabled</b>
								{t("settings.security.whitelistedRoutesDesc3", " are always whitelisted regardless of this setting.")}
							</p>
						</div>
						<Textarea
							id="whitelisted-routes"
							data-testid="whitelisted-routes-textarea"
							className="h-24"
							placeholder="/api/custom-webhook, /api/public-endpoint"
							value={localValues.whitelisted_routes}
							onChange={(e) => handleWhitelistedRoutesChange(e.target.value)}
						/>
					</div>
				</div>
			</div>
			<div className="bg-card sticky bottom-0 flex justify-end py-2">
				<Button onClick={handleSave} disabled={!hasChanges || isLoading || !hasSettingsUpdateAccess}>
					{isLoading ? t("settings.common.saving", "Saving...") : t("settings.security.saveChanges", "Save Changes")}
				</Button>
			</div>
			<Dialog open={!!setupTokenErrorMessage} onOpenChange={(open) => !open && setSetupTokenErrorMessage(null)}>
				<DialogContent data-testid="setup-token-error-dialog">
					<DialogHeader>
						<DialogTitle>{t("settings.security.setupTokenErrorTitle", "Setup token required")}</DialogTitle>
						<DialogDescription>{setupTokenErrorMessage}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setSetupTokenErrorMessage(null)} data-testid="setup-token-error-close">
							{t("settings.security.close", "Close")}
						</Button>
						<Button asChild data-testid="setup-token-error-view-docs">
							<a href="https://docs.getbifrost.ai/quickstart/gateway/setting-up-auth" target="_blank" rel="noopener noreferrer">
								{t("settings.security.viewDocs", "View docs")}
							</a>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

const RestartWarning = () => {
	const { t } = useTranslation();
	return (
		<Alert variant="destructive" className="mt-2">
			<AlertTriangle className="h-4 w-4" />
			<AlertDescription>{t("settings.security.restartWarning", "Need to restart Bifrost to apply changes.")}</AlertDescription>
		</Alert>
	);
};