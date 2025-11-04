import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Persist profile image to token from multiple sources
      if (account?.provider === 'google') {
        if (profile?.picture) {
          token.picture = profile.picture
        }
        if (user?.image) {
          token.picture = user.image
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        // Prioritize token picture, then session user image
        if (token.picture) {
          session.user.image = token.picture as string
        } else if (!session.user.image && token.sub) {
          // Fallback: construct Google profile image URL from user ID
          session.user.image = `https://lh3.googleusercontent.com/a/default-user`
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
