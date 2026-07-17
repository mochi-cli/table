import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';

type Props = Record<string, never>;

export default function SpaceRoute(_props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const queryString = context.req.url?.split('?')[1];
  const destination = queryString ? `/mochi/local?${queryString}` : '/mochi/local';

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};
