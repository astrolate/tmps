import React, { useState } from 'react';
import { Box, TextField, IconButton, Button, Stack } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

// 1つのアイテムの型定義
interface TodoItem {
  id: string;
  value: string;
}

export const DynamicTodoList: React.FC = () => {
  // アイテムのリストを管理するState
  const [items, setItems] = useState<TodoItem[]>([]);

  // 新しいフィールドを追加する処理
  const handleAddItem = () => {
    const newItem: TodoItem = {
      // 一意なIDを生成（本番環境ではuuid等のライブラリ推奨ですが、簡易的にはこれで足ります）
      id: crypto.randomUUID(), 
      value: '',
    };
    setItems((prev) => [...prev, newItem]);
  };

  // 指定したIDのフィールドを削除する処理
  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // 入力内容をStateに反映させる処理
  const handleChange = (id: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, value: newValue } : item))
    );
  };

  return (
    <Box sx={{ maxWidth: 500, margin: 'auto', p: 2 }}>
      {/* リスト表示部分 */}
      <Stack spacing={2} mb={2}>
        {items.map((item) => (
          <Box
            key={item.id} // 非常に重要: indexではなくidを使用する
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <TextField
              fullWidth
              variant="outlined"
              label="タスクを入力"
              size="small"
              value={item.value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(item.id, e)}
            />
            <IconButton 
              aria-label="delete" 
              color="error" 
              onClick={() => handleDeleteItem(item.id)}
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
      </Stack>

      {/* 追加ボタン */}
      <Button
        variant="dashed" // MUI v5.14以降で利用可能。古い場合は"outlined"でborderStyleを指定
        color="primary"
        startIcon={<AddIcon />}
        onClick={handleAddItem}
        fullWidth
        sx={{ borderStyle: 'dashed' }}
      >
        テキストフィールドを追加
      </Button>
    </Box>
  );
};
