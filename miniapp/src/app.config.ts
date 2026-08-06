export default defineAppConfig({
  pages: ["pages/index/index"],
  window: {
    navigationStyle: "custom",
    backgroundColor: "#f4f0e8",
    backgroundTextStyle: "dark",
    navigationBarBackgroundColor: "#f4f0e8",
    navigationBarTextStyle: "black",
    navigationBarTitleText: "说开",
  },
  permission: {
    "scope.record": {
      desc: "用于把你主动录下的表达转成文字；发送前仍可编辑和确认",
    },
  },
  lazyCodeLoading: "requiredComponents",
});
