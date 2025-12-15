import React from 'react';
import { Formik, Form, FieldArray, getIn, FormikHelpers } from 'formik';
import * as Yup from 'yup';
import {
  Box,
  TextField,
  IconButton,
  Button,
  MenuItem,
  Stack,
  Typography,
  Paper
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

// 1行分のデータ型
interface RowItem {
  id: string; // Reactのkey用（Formikの管理外だがレンダリング制御に必要）
  category: string;
  start: number | ''; // 初期値は空文字を許容しないと警告が出る場合があるため
  end: number | '';
}

// フォーム全体のデータ型
interface FormValues {
  items: RowItem[];
}

// Yupによるバリデーションスキーマ
const validationSchema = Yup.object({
  items: Yup.array().of(
    Yup.object({
      category: Yup.string().required('必須項目です'),
      start: Yup.number()
        .typeError('数値を入力してください')
        .required('必須')
        .min(0, '0以上'),
      end: Yup.number()
        .typeError('数値を入力してください')
        .required('必須')
        // startより大きい必要がある場合のロジック例
        .moreThan(Yup.ref('start'), 'Startより大きい値'),
    })
  ),
});

// 初期値
const initialValues: FormValues = {
  items: [
    { id: crypto.randomUUID(), category: '', start: '', end: '' }
  ],
};

// ドロップダウンの選択肢
const CATEGORIES = [
  { value: 'option1', label: 'オプション A' },
  { value: 'option2', label: 'オプション B' },
  { value: 'option3', label: 'オプション C' },
];

export const DynamicFormikList: React.FC = () => {
  const handleSubmit = (values: FormValues, actions: FormikHelpers<FormValues>) => {
    console.log('Submit:', values);
    alert(JSON.stringify(values, null, 2));
    actions.setSubmitting(false);
  };

  return (
    <Box sx={{ maxWidth: 800, margin: 'auto', p: 3 }}>
      <Typography variant="h6" mb={2}>設定フォーム</Typography>
      
      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, errors, touched, handleChange, handleBlur, isSubmitting }) => (
          <Form>
            <FieldArray name="items">
              {({ push, remove }) => (
                <Stack spacing={2}>
                  {values.items.map((item, index) => {
                    // ネストされたエラーとタッチ状態を安全に取得するヘルパー
                    const categoryError = getIn(errors, `items[${index}].category`);
                    const categoryTouched = getIn(touched, `items[${index}].category`);
                    const startError = getIn(errors, `items[${index}].start`);
                    const startTouched = getIn(touched, `items[${index}].start`);
                    const endError = getIn(errors, `items[${index}].end`);
                    const endTouched = getIn(touched, `items[${index}].end`);

                    return (
                      <Paper key={item.id} variant="outlined" sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                        {/* ドロップダウン (Category) */}
                        <TextField
                          select
                          label="種別"
                          name={`items[${index}].category`}
                          value={item.category}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={Boolean(categoryTouched && categoryError)}
                          helperText={categoryTouched && categoryError}
                          sx={{ width: 150 }}
                          size="small"
                        >
                          {CATEGORIES.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>

                        {/* 数値入力 (Start) */}
                        <TextField
                          label="Start"
                          name={`items[${index}].start`}
                          value={item.start}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={Boolean(startTouched && startError)}
                          helperText={startTouched && startError}
                          type="number"
                          size="small"
                          sx={{ width: 120 }}
                        />

                        {/* 数値入力 (End) */}
                        <TextField
                          label="End"
                          name={`items[${index}].end`}
                          value={item.end}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={Boolean(endTouched && endError)}
                          helperText={endTouched && endError}
                          type="number"
                          size="small"
                          sx={{ width: 120 }}
                        />

                        {/* 削除ボタン */}
                        <IconButton
                          color="error"
                          onClick={() => remove(index)}
                          disabled={values.items.length === 1} // 最後の1件は消さない等の制御が必要な場合
                          sx={{ mt: 0.5 }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Paper>
                    );
                  })}

                  {/* 追加ボタン */}
                  <Button
                    variant="dashed"
                    startIcon={<AddIcon />}
                    onClick={() =>
                      push({ id: crypto.randomUUID(), category: '', start: '', end: '' })
                    }
                    sx={{ borderStyle: 'dashed', borderWidth: 2 }}
                  >
                    行を追加
                  </Button>
                </Stack>
              )}
            </FieldArray>
            
            <Box mt={4}>
              <Button 
                type="submit" 
                variant="contained" 
                color="primary" 
                disabled={isSubmitting}
              >
                保存する
              </Button>
            </Box>
          </Form>
        )}
      </Formik>
    </Box>
  );
};
