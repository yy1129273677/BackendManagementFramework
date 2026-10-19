<script setup lang="ts">
/**
 * 自定义页面找不到时的提示页。
 *
 * 什么时候会看到它：
 *   路由管理里配的 componentPath（比如 examples/demo-table.vue）
 *   在前端 src/views 下找不到对应文件——通常是路径写错、或者文件还没提交。
 *
 * 为什么要有这个页面：
 *   没有它的话，路由能匹配上但组件是 undefined，页面会直接白屏，很难排查。
 */
import {useRoute} from 'vue-router'

const route = useRoute()
</script>

<template>
    <div class="page-card">
        <el-result icon="warning" title="自定义页面找不到" sub-title="路由配的 componentPath 在 src/views 下没有对应文件">
            <template #extra>
                <el-descriptions :column="1" border style="max-width: 640px; margin: 0 auto 16px">
                    <el-descriptions-item label="当前路由">{{ route.path }}</el-descriptions-item>
                    <el-descriptions-item label="组件路径">
                        {{ route.meta?.componentPath || '（未记录，请到路由管理里查看）' }}
                    </el-descriptions-item>
                </el-descriptions>

                <el-alert type="info" :closable="false" show-icon style="text-align: left">
                    <p>排查顺序：</p>
                    <p>1. 打开「路由管理」，找到这条路由，看「前端文件路径」填的是什么</p>
                    <p>2. 确认 <code>client/src/views/</code> 下存在这个 .vue 文件（路径相对 views 目录）</p>
                    <p>3. 新增文件后需要重新执行 <code>npm run dev</code> 或重新构建</p>
                </el-alert>
            </template>
        </el-result>
    </div>
</template>
