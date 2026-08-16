<template>
  <view class="auth-panel">
    <view class="auth-tabs">
      <button :class="{ active: mode === 'login' }" @tap="mode = 'login'">登录</button>
      <button :class="{ active: mode === 'register' }" @tap="mode = 'register'">注册</button>
    </view>
    <text class="auth-heading">{{ mode === "login" ? "继续上次的沟通" : "创建账号" }}</text>
    <text class="auth-description">使用 Supabase Auth 邮箱账号。会话会安全续期，退出时会清除本机房间与私人草稿。</text>
    <input
      v-model="email"
      class="auth-input"
      type="text"
      inputmode="email"
      :maxlength="254"
      placeholder="邮箱"
    />
    <input
      v-model="password"
      class="auth-input"
      type="text"
      password
      :maxlength="72"
      placeholder="密码（至少 8 位）"
      @confirm="submit"
    />
    <button
      class="primary full"
      :loading="submitting"
      :disabled="disabled || submitting || !canSubmit"
      @tap="submit"
    >{{ mode === "login" ? "登录" : "注册" }}</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { signInH5, signUpH5, type H5AuthResult } from "../services/auth";
import { userFacingErrorMessage } from "../services/user-facing-error";

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{
  authenticated: [result: H5AuthResult];
  notice: [kind: "info" | "error", message: string];
}>();

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const submitting = ref(false);
const canSubmit = computed(() => email.value.trim().length >= 5 && password.value.length >= 8);

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const result = mode.value === "login"
      ? await signInH5(email.value, password.value)
      : await signUpH5(email.value, password.value);
    password.value = "";
    email.value = result.email;
    if (result.confirmationRequired || !result.session) {
      mode.value = "login";
      emit("notice", "info", "注册信息已提交，请先点击确认邮件中的链接，再回来登录。");
      return;
    }
    emit("authenticated", result);
  } catch (error) {
    emit("notice", "error", userFacingErrorMessage(error, "认证没有完成，请检查网络后重试。"));
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
$surface: #fffdf8;
$ink: #1c2923;
$muted: #68726c;
$coral: #df5b3f;

.auth-panel {
  position: relative;
  z-index: 2;
  margin-top: 30px;
  padding: 18px;
  border: 1px solid rgba(49, 91, 71, .14);
  border-radius: 14px;
  background: rgba(255, 253, 248, .86);
  box-shadow: 0 10px 30px rgba(36, 45, 40, .06);
}

.auth-tabs {
  margin-bottom: 18px;
  padding: 3px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-radius: 9px;
  background: #ebe7de;
}

.auth-tabs button {
  min-height: 34px;
  margin: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: $muted;
  font-size: 12px;
  line-height: 1.4;
}

.auth-tabs button::after { border: 0; }

.auth-tabs button.active {
  background: $surface;
  box-shadow: 0 2px 8px rgba(36, 45, 40, .08);
  color: $ink;
  font-weight: 700;
}

.auth-heading,
.auth-description {
  display: block;
}

.auth-heading {
  font-family: "Songti SC", "STSong", serif;
  font-size: 20px;
  font-weight: 700;
}

.auth-description {
  margin: 7px 0 14px;
  color: $muted;
  font-size: 11px;
  line-height: 1.65;
}

.auth-input {
  width: 100%;
  height: 48px;
  margin-top: 10px;
  padding: 0 13px;
  border: 1px solid #d4d0c5;
  border-radius: 9px;
  background: #fff;
  box-sizing: border-box;
  color: $ink;
  font-size: 14px;
}

.primary {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: $coral;
  box-shadow: 0 7px 18px rgba(223, 91, 63, .18);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
}

.primary::after { border: 0; }
.primary[disabled] { box-shadow: none; opacity: .38; }
.full { width: 100%; margin-top: 14px; }
</style>
